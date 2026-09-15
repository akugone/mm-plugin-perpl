import { describe, expect, it } from "vitest";
import { buildCloseOrder, buildOpenOrder } from "../src/lib/perpl/orders";
import { fromScaled, parseDecimal, toLeverageHundredths, toScaled } from "../src/lib/perpl/scale";
import type { Market, Position } from "../src/lib/perpl/types";

const btc: Market = {
  id: 16, instance_id: 12, symbol: "BTC", name: "BTC Perp", size_units: "BTC", order_ttl_blocks: 20,
  order_max_market_slippage_bps: 1000, order_max_neg_pnl_collat_bps: 1000,
  config: { is_open: true, price_decimals: 1, size_decimals: 5, initial_margin: 1500, maintenance_margin: 2500, maker_fee: 45, taker_fee: 345 },
  state: { mrk: 769574 },
};

describe("scaling", () => {
  it("scales prices and sizes per market decimals", () => {
    expect(toScaled(95000, 1)).toBe(950000);
    expect(toScaled(0.01, 5)).toBe(1000);
    expect(fromScaled(769574, 1)).toBe(76957.4);
    expect(toLeverageHundredths(2)).toBe(200);
    expect(toLeverageHundredths(2.5)).toBe(250);
  });
  it("rejects sizes below the smallest unit and bad decimals", () => {
    expect(() => toScaled(0.000001, 5, "size")).toThrow(/smallest unit/);
    expect(() => parseDecimal("-1", "size")).toThrow();
    expect(() => parseDecimal("abc", "size")).toThrow();
    expect(() => toLeverageHundredths(0.5)).toThrow(/at least 1/);
  });
});

describe("open order frames", () => {
  it("builds a market long with the market's slippage ceiling", () => {
    const f = buildOpenOrder({ market: btc, side: "long", size: 0.01, leverage: 2 });
    expect(f).toEqual({ mt: 22, mkt: 16, t: 1, p: 0, s: 1000, ms: 1000, fl: 0, lv: 200, lb: 0 });
  });
  it("builds a post-only limit short without slippage", () => {
    const f = buildOpenOrder({ market: btc, side: "short", size: 0.5, leverage: 1, price: 80000.5, postOnly: true });
    expect(f).toEqual({ mt: 22, mkt: 16, t: 2, p: 800005, s: 50000, fl: 1, lv: 100, lb: 0 });
  });
  it("refuses post-only market orders and out-of-range slippage", () => {
    expect(() => buildOpenOrder({ market: btc, side: "long", size: 0.01, leverage: 1, postOnly: true })).toThrow(/limit price/);
    expect(() => buildOpenOrder({ market: btc, side: "long", size: 0.01, leverage: 1, slippageBps: 5000 })).toThrow(/slippage-bps/);
  });
});

describe("close order frames", () => {
  const pos: Position = { mkt: 16, acc: 7, pid: 99, st: 1, sd: 1, c: "50000000", ep: 700000, s: 2000, fee: "0", lv: 300 };
  it("closes the whole long with a CloseLong market order at the position's leverage", () => {
    expect(buildCloseOrder({ market: btc, position: pos })).toEqual({ mt: 22, mkt: 16, t: 3, p: 0, s: 2000, ms: 1000, fl: 0, lv: 300, lb: 0 });
  });
  it("closes part of a short with CloseShort and refuses oversize", () => {
    const short = { ...pos, sd: 2 as const };
    expect(buildCloseOrder({ market: btc, position: short, size: 0.01 }).t).toBe(4);
    expect(() => buildCloseOrder({ market: btc, position: short, size: 0.03 })).toThrow(/exceeds/);
  });
});
