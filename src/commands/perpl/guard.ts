import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { DEFAULT_GUARD, type GuardConfig, guardPath, loadGuard, loadLedger, rolling24hNotional, saveGuard } from "../../lib/guard.js";
import { decimalFlag, intFlag, listFlag } from "../../lib/inputs.js";
import { round } from "../../lib/perpl/scale.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  maxNotionalUsd: { type: InputFieldType.Text, flag: "max-notional-usd", message: "Max notional per order, in collateral (~USD)", required: false, prompt: false },
  maxLeverage: { type: InputFieldType.Text, flag: "max-leverage", message: "Max leverage per order (e.g. 3)", required: false, prompt: false },
  maxDailyNotionalUsd: { type: InputFieldType.Text, flag: "max-daily-notional-usd", message: "Max total notional opened in any rolling 24h window", required: false, prompt: false },
  maxOpenPositions: { type: InputFieldType.Text, flag: "max-open-positions", message: "Max simultaneously open positions", required: false, prompt: false },
  allowMarkets: { type: InputFieldType.Text, flag: "allow-markets", message: "Comma-separated market symbols allowed (e.g. BTC,ETH); 'all' clears the list", required: false, prompt: false },
  requireConfirm: { type: InputFieldType.Text, flag: "require-confirm", message: "true|false — require --yes / an interactive confirmation before each order", required: false, prompt: false },
  reset: { type: InputFieldType.Boolean, flag: "reset", message: "Restore the conservative defaults", required: false, prompt: false, default: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id for the rolling-24h usage figure (default 143)", required: false, prompt: false },
} satisfies InputSchema;

export type GuardResult = { config: GuardConfig; defaults: GuardConfig; changed: string[]; usedDailyNotionalUsd: number; chainId: number; path: string };

export default class PerplGuard extends PluginCommand<GuardResult> {
  static override description =
    "Show or change the plugin's guardrails: max notional per order, max leverage, rolling 24h notional cap, max open positions, allowed markets, confirmation. Orders that break a rule are refused before they reach Perpl. Without flags, shows the current config.";
  static override examples = [
    "<%= config.bin %> perpl guard",
    "<%= config.bin %> perpl guard --max-notional-usd 250 --max-leverage 5 --max-daily-notional-usd 1000",
    "<%= config.bin %> perpl guard --allow-markets BTC,ETH",
    "<%= config.bin %> perpl guard --reset",
  ];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:guard";

  async execute(io: CommandIO): Promise<GuardResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const current = loadGuard();
    const changed: string[] = [];
    let next: GuardConfig = { ...current };

    if (r.reset) {
      next = { ...DEFAULT_GUARD };
      changed.push("reset to defaults");
    }
    const n = decimalFlag(r.maxNotionalUsd, "max-notional-usd");
    if (n !== undefined) { next.maxNotionalUsd = n; changed.push(`max-notional-usd → ${n}`); }
    const lv = decimalFlag(r.maxLeverage, "max-leverage");
    if (lv !== undefined) { next.maxLeverage = lv; changed.push(`max-leverage → ${lv}`); }
    const d = decimalFlag(r.maxDailyNotionalUsd, "max-daily-notional-usd");
    if (d !== undefined) { next.maxDailyNotionalUsd = d; changed.push(`max-daily-notional-usd → ${d}`); }
    const p = intFlag(r.maxOpenPositions, "max-open-positions", { min: 1, max: 100 });
    if (p !== undefined) { next.maxOpenPositions = p; changed.push(`max-open-positions → ${p}`); }
    if ((r.allowMarkets ?? "").trim()) {
      const list = (r.allowMarkets ?? "").trim().toLowerCase() === "all" ? [] : listFlag(r.allowMarkets);
      next.allowedMarkets = list;
      changed.push(`allow-markets → ${list.length ? list.join(",") : "all"}`);
    }
    if ((r.requireConfirm ?? "").trim()) {
      const v = (r.requireConfirm ?? "").trim().toLowerCase();
      if (v !== "true" && v !== "false") throw new CommandError("INVALID_INPUT", "--require-confirm must be true or false.", "Example: --require-confirm false");
      next.requireConfirm = v === "true";
      changed.push(`require-confirm → ${v}`);
    }

    let path = guardPath();
    if (changed.length) {
      try {
        path = saveGuard(next);
      } catch (e) {
        throw new CommandError("INVALID_INPUT", (e as Error).message, "Every limit must be a positive number.");
      }
    }
    return { config: loadGuard(), defaults: DEFAULT_GUARD, changed, usedDailyNotionalUsd: round(rolling24hNotional(loadLedger(), chainId), 2), chainId, path };
  }

  override successHint(data: GuardResult): string {
    const c = data.config;
    const head = data.changed.length ? `Guard updated (${data.changed.join("; ")}).` : "Guard (unchanged).";
    return `${head} Per order ≤ $${c.maxNotionalUsd} at ≤ ${c.maxLeverage}x; ≤ $${c.maxDailyNotionalUsd} per rolling 24h ($${data.usedDailyNotionalUsd} used on chain ${data.chainId}); ≤ ${c.maxOpenPositions} open positions; markets ${c.allowedMarkets.length ? c.allowedMarkets.join(",") : "all"}; confirm ${c.requireConfirm ? "required" : "off"}.`;
  }
}
