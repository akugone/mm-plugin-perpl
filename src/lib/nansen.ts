/**
 * Nansen smart-money data → trade signals sized by the guard.
 *
 * Two sources, combined per Perpl market:
 *  - Smart Money spot netflow (Monad, Ethereum, Base, Arbitrum, Solana): are labelled smart wallets accumulating or distributing the asset?
 *  - Smart Money perp trades (Hyperliquid, trailing 7 days): how are they positioned on the same asset?
 * The output is a decision aid, not raw data: a bias, a score, the evidence lines a human can check, and a
 * suggested order already capped by the plugin's guard. Nothing here places an order.
 *
 * Credits: Nansen bills per call (X-Nansen-Credits-Cost header). The free tier is small; set NANSEN_API_KEY.
 */
import { CommandError } from "@metamask/agent-wallet/plugin";
import type { GuardConfig } from "./guard.js";

export const NANSEN_API = process.env.NANSEN_API_URL ?? "https://api.nansen.ai";

export type NetflowRow = {
  token_symbol?: string;
  token_address?: string;
  chain?: string;
  net_flow_1h_usd?: number | string;
  net_flow_24h_usd?: number | string;
  net_flow_7d_usd?: number | string;
  trader_count?: number;
};

export type PerpTradeRow = {
  trader_address?: string;
  trader_address_label?: string;
  token_symbol?: string;
  /** "Long" | "Short" — the live API field. */
  side?: string;
  /** Older docs name; kept as a fallback. */
  position_side?: string;
  action?: string; // Open | Add | Reduce | Close

  value_usd?: number | string;
  block_timestamp?: string;
};

/** Perpl market symbol → token symbols Nansen may report for the same asset. */
export const SYMBOL_ALIASES: Record<string, string[]> = {
  BTC: ["BTC", "WBTC", "CBBTC", "TBTC"],
  ETH: ["ETH", "WETH", "STETH", "WSTETH", "WEETH"],
  SOL: ["SOL", "WSOL"],
  MON: ["MON", "WMON"],
};

export function aliasesFor(market: string): string[] {
  const m = market.toUpperCase();
  return SYMBOL_ALIASES[m] ?? [m];
}

export type Signal = {
  market: string;
  bias: "long" | "short" | "neutral";
  /** -1 (strong short) … +1 (strong long). */
  score: number;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  suggestion?: { side: "long" | "short"; notionalUsd: number; leverage: number; note: string };
};

export type FetchLike = typeof fetch;

async function post<T>(apiKey: string, path: string, body: unknown, fetchImpl: FetchLike): Promise<{ data: T; credits?: string }> {
  const res = await fetchImpl(`${NANSEN_API}${path}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CommandError("NANSEN_AUTH_FAILED", `Nansen rejected the API key (HTTP ${res.status}).`, "Set NANSEN_API_KEY to a valid key from app.nansen.ai.");
  }
  if (res.status === 402 || res.status === 429) {
    throw new CommandError("NANSEN_CREDITS", `Nansen refused the call (HTTP ${res.status}): out of credits or rate-limited.`, "Wait for the daily top-up or add credits; signals are optional.");
  }
  if (!res.ok) throw new CommandError("NANSEN_HTTP_ERROR", `Nansen returned HTTP ${res.status} for ${path}.`, "Try again later.");
  const json = (await res.json()) as unknown;
  const data = (json && typeof json === "object" && "data" in (json as Record<string, unknown>) ? (json as { data: T }).data : json) as T;
  return { data, credits: res.headers.get("x-nansen-credits-cost") ?? undefined };
}

/**
 * Chains scanned for spot netflow. Nansen's smart-money netflow returns nothing for Monad today (checked 2026-10-07),
 * so the same assets are read where they trade (WBTC/WETH on Ethereum, Base, Arbitrum; SOL on Solana). One call.
 */
export const NETFLOW_CHAINS = ["monad", "ethereum", "base", "arbitrum", "solana"];

export async function fetchNetflow(apiKey: string, chains: string[] = NETFLOW_CHAINS, perPage = 100, fetchImpl: FetchLike = fetch): Promise<{ rows: NetflowRow[]; credits?: string }> {
  const { data, credits } = await post<NetflowRow[] | { items?: NetflowRow[] }>(apiKey, "/api/v1/smart-money/netflow", {
    chains,
    filters: { include_smart_money_labels: ["Fund", "Smart Trader", "30D Smart Trader", "90D Smart Trader", "180D Smart Trader"] },
    pagination: { page: 1, per_page: perPage },
    order_by: [{ field: "net_flow_24h_usd", direction: "DESC" }],
  }, fetchImpl);
  return { rows: Array.isArray(data) ? data : (data?.items ?? []), credits };
}

export async function fetchPerpTrades(apiKey: string, lookbackHours = 72, perPage = 200, fetchImpl: FetchLike = fetch): Promise<{ rows: PerpTradeRow[]; credits?: string }> {
  const { data, credits } = await post<PerpTradeRow[] | { items?: PerpTradeRow[] }>(apiKey, "/api/v1/smart-money/perp-trades", {
    lookback_hours: Math.min(168, Math.max(1, Math.round(lookbackHours))),
    only_new_positions: true,
    pagination: { page: 1, per_page: perPage },
    order_by: [{ field: "block_timestamp", direction: "DESC" }],
  }, fetchImpl);
  return { rows: Array.isArray(data) ? data : (data?.items ?? []), credits };
}

function sideOf(t: PerpTradeRow): string {
  return String(t.side ?? t.position_side ?? "");
}

/** Positioning = new or increased exposure; reductions and closes say nothing about direction conviction. */
function opensExposure(t: PerpTradeRow): boolean {
  return t.action === undefined || /^(open|add)/i.test(t.action);
}

function num(v: number | string | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Perp positioning reaches full weight at this much opened notional and this many trades in the window. */
export const PERP_FULL_WEIGHT_USD = 100_000;
export const PERP_FULL_WEIGHT_TRADES = 3;

/** Pure: turn raw rows into one signal per market, sized by the guard. */
export function computeSignals(markets: string[], netflow: NetflowRow[], perpTrades: PerpTradeRow[], guard: GuardConfig): Signal[] {
  const maxAbsFlow = Math.max(1, ...netflow.map((r) => Math.abs(num(r.net_flow_24h_usd))));
  return markets.map((market) => {
    const aliases = aliasesFor(market);
    const flows = netflow.filter((r) => aliases.includes(String(r.token_symbol ?? "").toUpperCase()));
    const flow24 = flows.reduce((s, r) => s + num(r.net_flow_24h_usd), 0);
    const flow7d = flows.reduce((s, r) => s + num(r.net_flow_7d_usd), 0);
    const traders = flows.reduce((s, r) => s + (r.trader_count ?? 0), 0);
    const flowScore = flows.length ? Math.max(-1, Math.min(1, flow24 / maxAbsFlow)) : 0;

    const trades = perpTrades.filter((t) => aliases.includes(String(t.token_symbol ?? "").toUpperCase()) && opensExposure(t));
    const longUsd = trades.filter((t) => /long/i.test(sideOf(t))).reduce((s, t) => s + num(t.value_usd), 0);
    const shortUsd = trades.filter((t) => /short/i.test(sideOf(t))).reduce((s, t) => s + num(t.value_usd), 0);
    // Direction (long vs short share) times conviction: a lone $98 open must not weigh like $500k across many traders.
    const perpUsd = longUsd + shortUsd;
    const perpWeight = Math.min(1, perpUsd / PERP_FULL_WEIGHT_USD) * Math.min(1, trades.length / PERP_FULL_WEIGHT_TRADES);
    const perpScore = perpUsd > 0 ? ((longUsd - shortUsd) / perpUsd) * perpWeight : 0;

    const sources = (flows.length ? 1 : 0) + (trades.length ? 1 : 0);
    const score = sources === 0 ? 0 : (flowScore * (flows.length ? 1 : 0) + perpScore * (trades.length ? 1 : 0)) / sources;
    const bias: Signal["bias"] = score > 0.2 ? "long" : score < -0.2 ? "short" : "neutral";
    const confidence: Signal["confidence"] = sources === 2 && Math.abs(score) > 0.5 ? "high" : sources >= 1 && Math.abs(score) > 0.2 ? "medium" : "low";

    const evidence: string[] = [];
    if (flows.length) evidence.push(`Smart money spot netflow: ${usd(flow24)} over 24h, ${usd(flow7d)} over 7d, ${traders} smart traders (${flows.map((f) => (f.chain ? `${f.token_symbol}@${f.chain}` : f.token_symbol)).join(", ")})`);
    else evidence.push("No smart-money spot netflow row for this asset in the top results");
    if (trades.length) evidence.push(`Smart money perp opens (Hyperliquid, trailing window): ${usd(longUsd)} long vs ${usd(shortUsd)} short across ${trades.length} trades${perpWeight < 1 ? ` (thin sample, weighted ${Math.round(perpWeight * 100)}%)` : ""}`);
    else evidence.push("No smart-money perp trades for this asset in the window");

    const signal: Signal = { market: market.toUpperCase(), bias, score: Math.round(score * 100) / 100, confidence, evidence };
    if (bias !== "neutral") {
      const strength = Math.min(1, Math.abs(score));
      const notionalUsd = Math.max(1, Math.round(guard.maxNotionalUsd * strength * 100) / 100);
      const leverage = Math.max(1, Math.min(guard.maxLeverage, Math.round((1 + strength) * 100) / 100));
      signal.suggestion = { side: bias, notionalUsd, leverage, note: `sized to ${Math.round(strength * 100)}% of guard max-notional-usd ($${guard.maxNotionalUsd}), leverage capped at ${guard.maxLeverage}x` };
    }
    return signal;
  });
}

function usd(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}k` : abs.toFixed(0);
  return `${n < 0 ? "-" : "+"}$${s}`;
}
