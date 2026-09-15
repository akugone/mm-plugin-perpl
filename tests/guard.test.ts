import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkOrder, DEFAULT_GUARD, loadGuard, loadLedger, recordOrder, rolling24hNotional, saveGuard } from "../src/lib/guard";
import { credentialKey, loadCredentials, saveCredentials } from "../src/lib/perpl/store";

const H = 3_600_000;

describe("guard rules", () => {
  const ledger = { version: 1 as const, orders: [] };
  it("passes an order inside every limit", () => {
    const v = checkOrder(DEFAULT_GUARD, ledger, { chainId: 143, market: "BTC", notionalUsd: 50, leverage: 2, openPositions: 0, opensNewPosition: true });
    expect(v).toEqual({ ok: true, violations: [], usedDailyNotionalUsd: 0 });
  });
  it("reports every violated rule", () => {
    const cfg = { ...DEFAULT_GUARD, allowedMarkets: ["ETH"] };
    const v = checkOrder(cfg, ledger, { chainId: 143, market: "btc", notionalUsd: 500, leverage: 10, openPositions: 3, opensNewPosition: true });
    expect(v.ok).toBe(false);
    expect(v.violations.join(" | ")).toMatch(/not in the allowed list/);
    expect(v.violations.join(" | ")).toMatch(/max-notional-usd/);
    expect(v.violations.join(" | ")).toMatch(/max-leverage/);
    expect(v.violations.join(" | ")).toMatch(/max-daily-notional-usd/);
    expect(v.violations.join(" | ")).toMatch(/max-open-positions/);
  });
  it("does not count an add-on to an existing position against max-open-positions", () => {
    const v = checkOrder(DEFAULT_GUARD, ledger, { chainId: 143, market: "BTC", notionalUsd: 10, leverage: 1, openPositions: 3, opensNewPosition: false });
    expect(v.ok).toBe(true);
  });
  it("applies a rolling 24h window per chain", () => {
    const now = 100 * H;
    const l = { version: 1 as const, orders: [
      { ts: now - 23 * H, chainId: 143, market: "BTC", notionalUsd: 200 },
      { ts: now - 25 * H, chainId: 143, market: "BTC", notionalUsd: 500 },
      { ts: now - 1 * H, chainId: 10143, market: "BTC", notionalUsd: 999 },
    ] };
    expect(rolling24hNotional(l, 143, now)).toBe(200);
    const v = checkOrder(DEFAULT_GUARD, l, { chainId: 143, market: "BTC", notionalUsd: 100, leverage: 1, openPositions: 0, opensNewPosition: true, now });
    expect(v.ok).toBe(true);
    // 200 already used in the window + 100 = 300 (the cap) passes; 100.01 breaches the rolling cap (the per-order cap is 100 too).
    const v2 = checkOrder({ ...DEFAULT_GUARD, maxNotionalUsd: 1000 }, l, { chainId: 143, market: "BTC", notionalUsd: 100.01, leverage: 1, openPositions: 0, opensNewPosition: true, now });
    expect(v2.ok).toBe(false);
    expect(v2.violations).toHaveLength(1);
    expect(v2.violations[0]).toMatch(/rolling 24h/);
  });
});

describe("guard + ledger + credential files", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-plugin-perpl-"));
  it("round-trips the guard config and normalises markets", () => {
    const path = saveGuard({ ...DEFAULT_GUARD, maxNotionalUsd: 250, allowedMarkets: ["btc", " eth ", "BTC"] }, dir);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const cfg = loadGuard(dir);
    expect(cfg.maxNotionalUsd).toBe(250);
    expect(cfg.allowedMarkets).toEqual(["BTC", "ETH"]);
    expect(() => saveGuard({ ...DEFAULT_GUARD, maxLeverage: 0 }, dir)).toThrow(/max-leverage/);
  });
  it("records orders and prunes entries older than 7 days", () => {
    const now = 1_000 * H;
    recordOrder({ ts: now - 8 * 24 * H, chainId: 143, market: "BTC", notionalUsd: 1 }, dir, now);
    recordOrder({ ts: now - 2 * H, chainId: 143, market: "ETH", notionalUsd: 40 }, dir, now);
    const l = loadLedger(dir);
    expect(l.orders.map((o) => o.market)).toEqual(["ETH"]);
    expect(rolling24hNotional(l, 143, now)).toBe(40);
  });
  it("stores credentials per chain+address at 0600 and honours the env override", () => {
    const addr = "0x62FE7760f9462D766AF38ECcfa4B5889d9fA32ab";
    const path = saveCredentials({ apiKey: "tok", seedHex: "0x" + "11".repeat(32), publicKeyHex: "0x" + "22".repeat(32), chainId: 10143, address: addr, label: "t", scopeMask: 2, createdAt: "now", source: "enroll" }, dir);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf8")).keys[credentialKey(10143, addr)].apiKey).toBe("tok");
    expect(loadCredentials(10143, addr.toLowerCase(), dir, {})?.apiKey).toBe("tok");
    expect(loadCredentials(143, addr, dir, {})).toBeUndefined();
    const env = loadCredentials(143, addr, dir, { PERPL_API_KEY: "envtok", PERPL_API_KEY_SECRET: "ab".repeat(32) });
    expect(env?.source).toBe("env");
    expect(env?.seedHex).toBe("0x" + "ab".repeat(32));
  });
});
