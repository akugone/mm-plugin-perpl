/** Pure builders for trading-websocket order frames. Everything scaled here is tested. */
import { toLeverageHundredths, toScaled } from "./scale.js";
import { type Market, ORDER_FLAG, ORDER_TYPE, type OrderRequest, type Position } from "./types.js";

export type Side = "long" | "short";

export type OpenOrderSpec = {
  market: Market;
  side: Side;
  /** Size in base units (e.g. 0.01 BTC). */
  size: number;
  leverage: number;
  /** Limit price; omit for a market order. */
  price?: number;
  postOnly?: boolean;
  /** Max market-order slippage, bps. Defaults to the market's ceiling. */
  slippageBps?: number;
};

export type UnkeyedOrder = Omit<OrderRequest, "rq" | "acc" | "sn">;

export function buildOpenOrder(spec: OpenOrderSpec): UnkeyedOrder {
  const { market, side } = spec;
  const s = toScaled(spec.size, market.config.size_decimals, "size");
  const p = spec.price === undefined ? 0 : toScaled(spec.price, market.config.price_decimals, "price");
  if (spec.postOnly && p === 0) throw new Error("post-only needs a limit price.");
  const ms = spec.slippageBps ?? market.order_max_market_slippage_bps;
  if (!Number.isInteger(ms) || ms < 0 || ms > market.order_max_market_slippage_bps) {
    throw new Error(`slippage-bps must be an integer between 0 and ${market.order_max_market_slippage_bps} for ${market.symbol}.`);
  }
  return {
    mt: 22,
    mkt: market.id,
    t: side === "long" ? ORDER_TYPE.OpenLong : ORDER_TYPE.OpenShort,
    p,
    s,
    ...(p === 0 ? { ms } : {}),
    fl: spec.postOnly ? ORDER_FLAG.PostOnly : ORDER_FLAG.GoodTillCancel,
    lv: toLeverageHundredths(spec.leverage),
    lb: 0, // server substitutes the market's max validity window
  };
}

export type CloseOrderSpec = {
  market: Market;
  position: Position;
  /** Size in base units; omit to close the whole position. */
  size?: number;
  slippageBps?: number;
};

export function buildCloseOrder(spec: CloseOrderSpec): UnkeyedOrder {
  const { market, position } = spec;
  const s = spec.size === undefined ? position.s : toScaled(spec.size, market.config.size_decimals, "size");
  if (s > position.s) throw new Error(`size exceeds the open position (${position.s} scaled units).`);
  const ms = spec.slippageBps ?? market.order_max_market_slippage_bps;
  return {
    mt: 22,
    mkt: market.id,
    t: position.sd === 1 ? ORDER_TYPE.CloseLong : ORDER_TYPE.CloseShort,
    p: 0,
    s,
    ms,
    fl: ORDER_FLAG.GoodTillCancel,
    lv: position.lv,
    lb: 0,
  };
}

/** Notional in collateral currency for a size at a price. */
export function notionalUsd(size: number, price: number): number {
  return size * price;
}
