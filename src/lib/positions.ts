/** Human view of open positions + the risk metrics the `risk` command alerts on. Estimates are labelled as such. */
import { amountToHuman, fromLeverageHundredths, fromScaled, round } from "./perpl/scale.js";
import type { Market, PerplContext, Position, Token } from "./perpl/types.js";
import { markPrice } from "./perpl/rest.js";

export type PositionView = {
  positionId: number;
  market: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice?: number;
  leverage: number;
  collateral: number;
  notional?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  /** (collateral + unrealized PnL) / notional. Falls toward the maintenance requirement as the position loses. */
  marginRatio?: number;
  /** Price at which margin ratio would hit the maintenance requirement, first-order estimate ignoring funding and fees. */
  liquidationPriceEstimate?: number;
  /** Distance from mark to the estimated liquidation price, as a fraction of mark. */
  liquidationDistancePct?: number;
  fundingRateRaw?: number;
  openedAt?: string;
};

/**
 * Perpl publishes `maintenance_margin` (and `initial_margin`) per market as a leverage in hundredths, the contract's
 * `maintMarginFracHdths`: MMR = notional / MMF. BTC's 2500 means 25.00x, i.e. a 4% maintenance margin, matching the
 * docs' table (BTC 4%, ETH 5%). Treat every liquidation figure as a first-order estimate (no funding, no fees).
 */
export function maintenanceFraction(m: Market): number {
  const raw = m.config.maintenance_margin;
  if (!Number.isFinite(raw) || raw <= 0) return 0.05;
  return 100 / raw;
}

export function viewPosition(ctx: PerplContext, p: Position, collateral: Token): PositionView | undefined {
  const m = ctx.markets.find((x) => x.id === p.mkt);
  if (!m) return undefined;
  const side: "long" | "short" = p.sd === 1 ? "long" : "short";
  const size = fromScaled(p.s, m.config.size_decimals);
  const entry = fromScaled(p.ep, m.config.price_decimals);
  const mark = markPrice(m);
  const lev = fromLeverageHundredths(p.lv);
  const coll = amountToHuman(p.c, collateral.decimals);
  const view: PositionView = {
    positionId: p.pid,
    market: m.symbol,
    side,
    size: round(size, m.config.size_decimals),
    entryPrice: round(entry, m.config.price_decimals),
    markPrice: mark === undefined ? undefined : round(mark, m.config.price_decimals),
    leverage: lev,
    collateral: round(coll, 2),
    fundingRateRaw: m.funding?.rate,
    openedAt: p.ots?.t ? new Date(p.ots.t).toISOString() : undefined,
  };
  if (mark !== undefined && size > 0) {
    const notional = size * mark;
    const dir = side === "long" ? 1 : -1;
    const upnl = (mark - entry) * size * dir;
    const equity = coll + upnl;
    const mm = maintenanceFraction(m);
    view.notional = round(notional, 2);
    view.unrealizedPnl = round(upnl, 2);
    view.unrealizedPnlPct = coll > 0 ? round((upnl / coll) * 100, 2) : undefined;
    view.marginRatio = notional > 0 ? round(equity / notional, 4) : undefined;
    // Solve equity(price) = mm * size * price for price: coll + (price - entry)*size*dir = mm*size*price
    const denom = size * (dir - mm);
    if (denom !== 0) {
      const liq = (entry * size * dir - coll) / denom;
      if (Number.isFinite(liq) && liq > 0) {
        view.liquidationPriceEstimate = round(liq, m.config.price_decimals);
        view.liquidationDistancePct = round(Math.abs(mark - liq) / mark, 4);
      }
    }
  }
  return view;
}

export type RiskThresholds = { minMarginRatio: number; maxLossPct: number; minLiquidationDistancePct: number };
export const DEFAULT_RISK: RiskThresholds = { minMarginRatio: 0.1, maxLossPct: 50, minLiquidationDistancePct: 0.1 };

export type Alert = { level: "warn" | "critical"; market: string; positionId: number; reason: string };

export function assessRisk(views: PositionView[], t: RiskThresholds = DEFAULT_RISK): Alert[] {
  const alerts: Alert[] = [];
  for (const v of views) {
    if (v.marginRatio !== undefined && v.marginRatio < t.minMarginRatio) {
      alerts.push({ level: v.marginRatio < t.minMarginRatio / 2 ? "critical" : "warn", market: v.market, positionId: v.positionId, reason: `margin ratio ${v.marginRatio} below ${t.minMarginRatio}` });
    }
    if (v.unrealizedPnlPct !== undefined && v.unrealizedPnlPct <= -t.maxLossPct) {
      alerts.push({ level: v.unrealizedPnlPct <= -t.maxLossPct * 1.5 ? "critical" : "warn", market: v.market, positionId: v.positionId, reason: `unrealized loss ${v.unrealizedPnlPct}% of collateral (limit ${t.maxLossPct}%)` });
    }
    if (v.liquidationDistancePct !== undefined && v.liquidationDistancePct < t.minLiquidationDistancePct) {
      alerts.push({ level: v.liquidationDistancePct < t.minLiquidationDistancePct / 2 ? "critical" : "warn", market: v.market, positionId: v.positionId, reason: `estimated liquidation ${round(v.liquidationDistancePct * 100, 2)}% away (limit ${round(t.minLiquidationDistancePct * 100, 2)}%)` });
    }
  }
  return alerts;
}
