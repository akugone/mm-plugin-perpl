/** Subset of the Perpl API types this plugin reads (PerplFoundation/api-docs types.md). Field names are the wire names. */

export type MarketConfig = {
  is_open: boolean;
  price_decimals: number;
  size_decimals: number;
  initial_margin: number;
  maintenance_margin: number;
  maker_fee: number;
  taker_fee: number;
};

export type MarketState = {
  mrk?: number; // mark price (scaled)
  mid?: number;
  bid?: number;
  ask?: number;
  lst?: number; // last trade
  prv?: number; // previous 24h reference
  oi?: number; // open interest (scaled size)
  dva?: string; // 24h volume (collateral amount)
};

export type Market = {
  id: number;
  instance_id: number;
  symbol: string;
  name: string;
  size_units: string;
  order_ttl_blocks: number;
  order_max_market_slippage_bps: number;
  order_max_neg_pnl_collat_bps: number;
  config: MarketConfig;
  state?: MarketState;
  funding?: { rate?: number; idx?: number };
};

export type Token = { id: number; address: string; symbol: string; name: string; decimals: number };

export type Instance = {
  id: number;
  address: string;
  collateral_token_id: number;
  min_account_open_amount: string;
  min_deposit_amount: string;
};

export type PerplContext = {
  chain: { chain_id: number; name: string; gas?: { h?: number } };
  instances: Instance[];
  tokens: Token[];
  markets: Market[];
};

export type Account = {
  in: number;
  id: number;
  fr: boolean; // frozen
  fw: boolean; // order forwarding allowed ("one-click trading")
  ft: number; // fee tier
  lfr: number; // last forwarded request id
  b: string; // balance (collateral amount)
  lb: string; // locked balance
};

export type WalletSnapshot = {
  mt: 19;
  sn?: number;
  at?: { b?: number; t?: number };
  addr: string;
  n: number;
  as?: Account[];
};

export type Position = {
  mkt: number;
  acc: number;
  pid: number;
  st: number; // 1 open, 2 closed, 3 liquidated, 4 deleveraged, 5 unwound
  sd: 1 | 2; // 1 long, 2 short
  c: string; // collateral (amount)
  ep: number; // entry price (scaled)
  s: number; // size (scaled)
  fee: string;
  lv: number; // leverage hundredths
  dpnl?: string;
  fnd?: string;
  ots?: { b?: number; t?: number };
};

export type Order = {
  rq: number;
  mkt: number;
  acc: number;
  oid: number;
  st: number; // 1 pending, 2 open, 3 partially filled, 4 filled, 5 canceled, 7 failed
  sr: number;
  fr?: number;
  t: number;
  p?: number;
  os: number;
  fp: number;
  fs: number;
  f: string;
  lv: number;
};

export const ORDER_TYPE = { OpenLong: 1, OpenShort: 2, CloseLong: 3, CloseShort: 4, Cancel: 5 } as const;
export const ORDER_FLAG = { GoodTillCancel: 0, PostOnly: 1, FillOrKill: 2, ImmediateOrCancel: 4 } as const;

export const ORDER_STATUS: Record<number, string> = {
  1: "PENDING", 2: "OPEN", 3: "PARTIALLY_FILLED", 4: "FILLED", 5: "CANCELED", 7: "FAILED", 8: "UNTRIGGERED", 9: "TRIGGERED", 10: "EXECUTED",
};
export const POSITION_STATUS: Record<number, string> = { 1: "OPEN", 2: "CLOSED", 3: "LIQUIDATED", 4: "DELEVERAGED", 5: "UNWOUND" };
export const ORDER_FAILURE: Record<number, string> = {
  1: "InsufficientBalance", 5: "PerpetualSolvency", 8: "ExceedsMaxNegPnlCollat",
};
/** OrderStatusReason, full table from PerplFoundation/api-docs types.md. */
export const ORDER_STATUS_REASON: Record<number, string> = {
  0: "Unspecified", 1: "AmountExceedsAvailableBalance", 2: "AccountFrozen", 3: "CancelExistingInvalidCloseOrders",
  4: "CantChangeCloseOrder", 5: "ChangeExpiredOrderNeedsNewExpiry", 6: "ClearingExpiredOrder",
  7: "ClearingFrozenAccountOrder", 8: "ClearingInvalidCloseOrder", 9: "ClearingSelfMatchingOrder",
  10: "CloseOrderExceedsPosition", 11: "CloseOrderPositionMismatch", 12: "ContractNotOperational", 13: "CrossesBook",
  14: "ExceedsLastExecutionBlock", 15: "ForwardingReverted", 16: "ImmediateOrCancelExecuted",
  17: "ImmediateOrderUnderMinimum", 18: "InsuficientFundsForRecycleFee", 19: "InvalidAccountFrozenOrder",
  20: "InvalidExpiryBlock", 21: "InvalidOrderId", 22: "MakerOrderFilled", 23: "MakerOrderSettlementFailed",
  24: "MaximumAccountOrders", 25: "MaxMatchesReached", 26: "NoOp", 27: "OrderBookFull", 28: "OrderCancelled",
  29: "OrderCancelledByAdmin", 30: "OrderCancelledByLiquidator", 31: "OrderChanged", 32: "OrderDescIdTooLow",
  33: "OrderDoesNotExist", 34: "OrderForwardingNotAllowed", 35: "OrderPlaced", 36: "OrderPostFailed",
  37: "OrderSettlementImpliesInsolvent", 38: "OrderSizeExceedsAvailableSize", 39: "PostOrderUnderMinimum",
  40: "PriceOutOfRange", 41: "RecycleBalanceInsufficientSevere", 42: "SizeOutOfRange", 43: "TakerOrderFilled",
  44: "TakerOrderSettlementFailed", 45: "UnableToCancelOrder", 46: "UnmatchedLotRemainsInFillOrKill",
  47: "UnspecifiedCollateral", 48: "UnspecifiedPrice", 49: "UnspecifiedSize", 50: "WrongAccountForOrder",
  51: "WrongChainForOrder", 52: "WrongMarketForOrder", 53: "PerpetualInsolvent", 54: "Triggered",
  55: "InvalidAmount", 56: "InvalidFlags", 57: "InvalidTriggerOrder", 58: "WrongTriggerPosition",
  59: "TriggerDescIdTooLow", 60: "TriggerOrderRequest", 61: "ValueExceedsMaximum",
  62: "ClearingRemainingOrderLockBeyondBalance", 63: "PriceSetDuringTriggerExec",
  64: "TriggeredExecutionAttemptsExhausted", 65: "TriggeredOrderExecuted", 66: "TriggeredOrderPartiallyFilled",
  67: "TriggeredOrderExpired", 68: "TriggeredOrderRecoverableFailure", 69: "OrderExtensionRejected",
};

export type OrderRequest = {
  mt: 22;
  sn?: number;
  rq: number;
  mkt: number;
  acc: number;
  t: number;
  p?: number;
  s: number;
  ms?: number;
  mnp?: number;
  fl: number;
  lv: number;
  lb: number;
};

export type StatusResponse = { mt: 3; cid?: number; status: { code: number; error?: string } };
