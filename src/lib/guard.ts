/**
 * The plugin's own guardrails. Orders placed through Perpl's API are forwarded by the exchange, not sent by the
 * wallet, so MetaMask's Guard Mode (allowlists, outflow limit, Blockaid) does not see them. This module is the
 * equivalent for perps: caps that are checked before every order, plus a rolling 24h notional ledger mirroring
 * MetaMask's rolling outflow limit. Deposits, account creation and forwarding permission still go through the
 * wallet and therefore through MetaMask's own pipeline.
 */
import { join } from "node:path";
import { pluginHome } from "./perpl/config.js";
import { ensureHome, readJson, writeJson } from "./perpl/store.js";

export type GuardConfig = {
  /** Max notional (collateral currency, ~USD) per order. */
  maxNotionalUsd: number;
  /** Max leverage per order. */
  maxLeverage: number;
  /** Max total notional opened in any rolling 24h window. */
  maxDailyNotionalUsd: number;
  /** Max number of simultaneously open positions after this order. */
  maxOpenPositions: number;
  /** Market symbols allowed to trade; empty = all. */
  allowedMarkets: string[];
  /** Require an explicit confirmation (--yes or interactive prompt) before sending an order. */
  requireConfirm: boolean;
};

export const DEFAULT_GUARD: GuardConfig = {
  maxNotionalUsd: 100,
  maxLeverage: 3,
  maxDailyNotionalUsd: 300,
  maxOpenPositions: 3,
  allowedMarkets: [],
  requireConfirm: true,
};

export type LedgerEntry = { ts: number; chainId: number; market: string; notionalUsd: number; rq?: number };
export type Ledger = { version: 1; orders: LedgerEntry[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export function guardPath(dir: string = pluginHome()): string {
  return join(dir, "guard.json");
}
export function ledgerPath(dir: string = pluginHome()): string {
  return join(dir, "ledger.json");
}

export function loadGuard(dir: string = pluginHome()): GuardConfig {
  const stored = readJson<Partial<GuardConfig>>(guardPath(dir), {});
  return normalizeGuard({ ...DEFAULT_GUARD, ...stored });
}

export function saveGuard(cfg: GuardConfig, dir: string = pluginHome()): string {
  ensureHome(dir);
  const path = guardPath(dir);
  writeJson(path, normalizeGuard(cfg));
  return path;
}

export function normalizeGuard(cfg: GuardConfig): GuardConfig {
  const pos = (n: unknown, name: string): number => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number.`);
    return v;
  };
  return {
    maxNotionalUsd: pos(cfg.maxNotionalUsd, "max-notional-usd"),
    maxLeverage: pos(cfg.maxLeverage, "max-leverage"),
    maxDailyNotionalUsd: pos(cfg.maxDailyNotionalUsd, "max-daily-notional-usd"),
    maxOpenPositions: Math.floor(pos(cfg.maxOpenPositions, "max-open-positions")),
    allowedMarkets: [...new Set((cfg.allowedMarkets ?? []).map((m) => String(m).trim().toUpperCase()).filter(Boolean))],
    requireConfirm: cfg.requireConfirm !== false,
  };
}

export function loadLedger(dir: string = pluginHome()): Ledger {
  const l = readJson<Ledger>(ledgerPath(dir), { version: 1, orders: [] });
  return { version: 1, orders: Array.isArray(l.orders) ? l.orders : [] };
}

export function recordOrder(entry: LedgerEntry, dir: string = pluginHome(), now: number = Date.now()): Ledger {
  ensureHome(dir);
  const l = loadLedger(dir);
  l.orders = [...l.orders.filter((o) => now - o.ts < 7 * DAY_MS), entry];
  writeJson(ledgerPath(dir), l);
  return l;
}

export function rolling24hNotional(ledger: Ledger, chainId: number, now: number = Date.now()): number {
  return ledger.orders.filter((o) => o.chainId === chainId && now - o.ts < DAY_MS).reduce((s, o) => s + o.notionalUsd, 0);
}

export type OrderCheck = {
  chainId: number;
  market: string;
  notionalUsd: number;
  leverage: number;
  /** Open positions before this order. */
  openPositions: number;
  /** True when the order adds a new position (not a close / increase of an existing one). */
  opensNewPosition: boolean;
  now?: number;
};

export type GuardVerdict = { ok: boolean; violations: string[]; usedDailyNotionalUsd: number };

export function checkOrder(cfg: GuardConfig, ledger: Ledger, o: OrderCheck): GuardVerdict {
  const now = o.now ?? Date.now();
  const violations: string[] = [];
  const market = o.market.toUpperCase();
  if (cfg.allowedMarkets.length && !cfg.allowedMarkets.includes(market)) {
    violations.push(`market ${market} is not in the allowed list (${cfg.allowedMarkets.join(", ")})`);
  }
  if (o.notionalUsd > cfg.maxNotionalUsd) {
    violations.push(`notional ${fmt(o.notionalUsd)} exceeds max-notional-usd ${fmt(cfg.maxNotionalUsd)}`);
  }
  if (o.leverage > cfg.maxLeverage) {
    violations.push(`leverage ${o.leverage}x exceeds max-leverage ${cfg.maxLeverage}x`);
  }
  const used = rolling24hNotional(ledger, o.chainId, now);
  if (used + o.notionalUsd > cfg.maxDailyNotionalUsd) {
    violations.push(`rolling 24h notional ${fmt(used)} + ${fmt(o.notionalUsd)} exceeds max-daily-notional-usd ${fmt(cfg.maxDailyNotionalUsd)}`);
  }
  if (o.opensNewPosition && o.openPositions + 1 > cfg.maxOpenPositions) {
    violations.push(`${o.openPositions} open position(s) + 1 exceeds max-open-positions ${cfg.maxOpenPositions}`);
  }
  return { ok: violations.length === 0, violations, usedDailyNotionalUsd: used };
}

function fmt(n: number): string {
  return `$${Math.round(n * 100) / 100}`;
}
