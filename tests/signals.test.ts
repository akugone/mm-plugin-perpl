import { describe, expect, it } from "vitest";
import { DEFAULT_GUARD } from "../src/lib/guard";
import { aliasesFor, computeSignals } from "../src/lib/nansen";
import { assessRisk, maintenanceFraction, viewPosition } from "../src/lib/positions";
import type { Market, PerplContext, Position } from "../src/lib/perpl/types";

describe("nansen signals", () => {
  const netflow = [
    { token_symbol: "WBTC", chain: "monad", net_flow_24h_usd: 800000, net_flow_7d_usd: 2000000, trader_count: 12 },
    { token_symbol: "WETH", chain: "monad", net_flow_24h_usd: -400000, net_flow_7d_usd: -100000, trader_count: 5 },
    { token_symbol: "MON", chain: "monad", net_flow_24h_usd: 10000, net_flow_7d_usd: 0, trader_count: 1 },
  ];
  const perps = [
    { token_symbol: "BTC", position_side: "Long", value_usd: 300000 },
    { token_symbol: "BTC", position_side: "Long", value_usd: 100000 },
    { token_symbol: "ETH", position_side: "Short", value_usd: 250000 },
    { token_symbol: "ETH", position_side: "Long", value_usd: 50000 },
  ];
  it("maps Perpl symbols to the wrapped tokens Nansen reports", () => {
    expect(aliasesFor("btc")).toContain("WBTC");
    expect(aliasesFor("XYZ")).toEqual(["XYZ"]);
  });
  it("combines spot netflow and perp positioning into a sized suggestion", () => {
    const [btc, eth, sol] = computeSignals(["BTC", "ETH", "SOL"], netflow, perps, DEFAULT_GUARD);
    expect(btc.bias).toBe("long");
    expect(btc.confidence).toBe("high");
    expect(btc.suggestion?.side).toBe("long");
    expect(btc.suggestion!.notionalUsd).toBeLessThanOrEqual(DEFAULT_GUARD.maxNotionalUsd);
    expect(btc.suggestion!.leverage).toBeLessThanOrEqual(DEFAULT_GUARD.maxLeverage);
    expect(btc.evidence[0]).toMatch(/\+\$800\.0k over 24h/);
    expect(eth.bias).toBe("short");
    expect(sol.bias).toBe("neutral");
    expect(sol.suggestion).toBeUndefined();
    expect(sol.confidence).toBe("low");
  });
});

describe("position view and risk", () => {
  const btc: Market = {
    id: 16, instance_id: 12, symbol: "BTC", name: "BTC Perp", size_units: "BTC", order_ttl_blocks: 20,
    order_max_market_slippage_bps: 1000, order_max_neg_pnl_collat_bps: 1000,
    config: { is_open: true, price_decimals: 1, size_decimals: 5, initial_margin: 1500, maintenance_margin: 500, maker_fee: 45, taker_fee: 345 },
    state: { mrk: 900000 }, // $90,000.0
  };
  const ctx: PerplContext = { chain: { chain_id: 143, name: "Monad" }, instances: [], tokens: [], markets: [btc] };
  const ausd = { id: 1, address: "0x0", symbol: "AUSD", name: "AUSD", decimals: 6 };
  // long 0.01 BTC from $100,000 with $200 collateral (10x) → mark $90,000: uPnL = -$100, equity $100, notional $900
  const pos: Position = { mkt: 16, acc: 1, pid: 5, st: 1, sd: 1, c: "200000000", ep: 1000000, s: 1000, fee: "0", lv: 1000 };

  it("interprets maintenance margin as bps when small", () => {
    expect(maintenanceFraction(btc)).toBe(0.05);
  });
  it("computes pnl, margin ratio and an estimated liquidation price", () => {
    const v = viewPosition(ctx, pos, ausd)!;
    expect(v.side).toBe("long");
    expect(v.size).toBe(0.01);
    expect(v.entryPrice).toBe(100000);
    expect(v.markPrice).toBe(90000);
    expect(v.unrealizedPnl).toBe(-100);
    expect(v.unrealizedPnlPct).toBe(-50);
    expect(v.marginRatio).toBeCloseTo(100 / 900, 3);
    // liq: 200 + (p - 100000)*0.01 = 0.05*0.01*p → p = (1000 - 200)/(0.01 - 0.0005) = 84210.5
    expect(v.liquidationPriceEstimate).toBeCloseTo(84210.5, 0);
    expect(v.liquidationDistancePct).toBeCloseTo((90000 - 84210.5) / 90000, 3);
  });
  it("raises alerts on the documented thresholds", () => {
    const v = viewPosition(ctx, pos, ausd)!;
    const alerts = assessRisk([v], { minMarginRatio: 0.15, maxLossPct: 40, minLiquidationDistancePct: 0.1 });
    expect(alerts.map((a) => a.reason).join(" | ")).toMatch(/margin ratio/);
    expect(alerts.map((a) => a.reason).join(" | ")).toMatch(/unrealized loss -50%/);
    expect(alerts.map((a) => a.reason).join(" | ")).toMatch(/estimated liquidation/);
    expect(assessRisk([v], { minMarginRatio: 0.05, maxLossPct: 60, minLiquidationDistancePct: 0.05 })).toEqual([]);
  });
});
