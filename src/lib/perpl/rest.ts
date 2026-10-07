import { CommandError } from "@metamask/agent-wallet/plugin";
import { type ApiCredentials, signRest } from "./auth.js";
import { network } from "./config.js";
import { fromScaled } from "./scale.js";
import type { Instance, Market, PerplContext, Token } from "./types.js";

export type FetchLike = typeof fetch;

export async function fetchContext(chainId: number, fetchImpl: FetchLike = fetch): Promise<PerplContext> {
  const net = network(chainId);
  const res = await fetchImpl(`${net.api}/v1/pub/context`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new CommandError("PERPL_CONTEXT_FAILED", `Perpl ${net.name} returned HTTP ${res.status} for /v1/pub/context.`, "Check your network, or try again in a minute.");
  }
  const ctx = (await res.json()) as PerplContext;
  if (!Array.isArray(ctx.markets) || !Array.isArray(ctx.instances)) {
    throw new CommandError("PERPL_CONTEXT_INVALID", "Perpl context has an unexpected shape.", "The API may have changed; update the plugin.");
  }
  return normalizeContext(ctx);
}

/**
 * Perpl mainnet publishes some markets (BTC, MON on 2026-10-07) with an empty `symbol` and the ticker only in `name`
 * and `size_units`. Every command keys markets by symbol, so fill it in once here.
 */
export function normalizeContext(ctx: PerplContext): PerplContext {
  for (const m of ctx.markets) {
    const raw = m as Market & { name?: string; size_units?: string };
    if (!m.symbol?.trim()) m.symbol = (raw.size_units || raw.name || String(m.id)).trim().toUpperCase();
  }
  return ctx;
}

export function findMarket(ctx: PerplContext, symbolOrId: string): Market {
  const key = symbolOrId.trim().toUpperCase();
  const m = ctx.markets.find((x) => x.symbol.toUpperCase() === key || String(x.id) === key);
  if (!m) {
    const list = ctx.markets.map((x) => x.symbol).join(", ");
    throw new CommandError("PERPL_UNKNOWN_MARKET", `No Perpl market '${symbolOrId}'.`, `Available: ${list}. Run \`mm perpl markets\`.`);
  }
  return m;
}

export function instanceOf(ctx: PerplContext, market?: Market): Instance {
  const inst = market ? ctx.instances.find((i) => i.id === market.instance_id) : ctx.instances[0];
  if (!inst) throw new CommandError("PERPL_NO_INSTANCE", "Perpl context lists no exchange instance.", "Try again later.");
  return inst;
}

export function collateralToken(ctx: PerplContext, inst: Instance = instanceOf(ctx)): Token {
  const t = ctx.tokens.find((x) => x.id === inst.collateral_token_id);
  if (!t) throw new CommandError("PERPL_NO_COLLATERAL", "Perpl context lists no collateral token.", "Try again later.");
  return t;
}

export function markPrice(m: Market): number | undefined {
  const raw = m.state?.mrk ?? m.state?.mid ?? m.state?.lst;
  return raw === undefined ? undefined : fromScaled(raw, m.config.price_decimals);
}

/** Signed GET against an authenticated REST endpoint; `target` starts at /v1/... and is signed byte-for-byte. */
export async function authedGet<T = unknown>(chainId: number, creds: ApiCredentials, target: string, fetchImpl: FetchLike = fetch): Promise<T> {
  const net = network(chainId);
  const headers = signRest(creds, chainId, "GET", target);
  const res = await fetchImpl(`${net.api}${target}`, { headers: { ...headers, Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) {
    throw new CommandError("PERPL_AUTH_FAILED", `Perpl rejected the API key (HTTP ${res.status}).`, "The key may be revoked or expired. Run `mm perpl enroll` again.");
  }
  if (!res.ok) throw new CommandError("PERPL_HTTP_ERROR", `Perpl returned HTTP ${res.status} for ${target}.`, "Try again; if it persists check https://docs.perpl.xyz.");
  return (await res.json()) as T;
}
