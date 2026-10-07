import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { loadGuard } from "../../lib/guard.js";
import { intFlag, listFlag } from "../../lib/inputs.js";
import { computeSignals, fetchNetflow, fetchPerpTrades, type Signal } from "../../lib/nansen.js";
import { network } from "../../lib/perpl/config.js";
import { fetchContext } from "../../lib/perpl/rest.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id whose Perpl markets to score: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  markets: { type: InputFieldType.Text, flag: "markets", message: "Comma-separated market symbols to score (default: all open Perpl markets)", required: false, prompt: false },
  lookbackHours: { type: InputFieldType.Text, flag: "lookback-hours", message: "Smart-money perp trades window, 1-168 hours (default 72)", required: false, prompt: false },
  skipPerps: { type: InputFieldType.Boolean, flag: "skip-perps", message: "Only use smart-money spot netflow (saves Nansen credits)", required: false, prompt: false, default: false },
} satisfies InputSchema;

export type SignalsResult = {
  chainId: number;
  network: string;
  source: "nansen";
  lookbackHours: number;
  creditsSpent: string[];
  guard: { maxNotionalUsd: number; maxLeverage: number };
  signals: Signal[];
  disclaimer: string;
};

export default class PerplSignals extends PluginCommand<SignalsResult> {
  static override description =
    "Trade ideas for Perpl markets from Nansen smart-money data: smart-money spot netflow (Monad, Ethereum, Base, Arbitrum, Solana) plus smart-money perp positioning on the same assets, combined into a bias, a score, checkable evidence and a suggested order already capped by the plugin's guard. Needs NANSEN_API_KEY. Never places an order.";
  static override examples = ["<%= config.bin %> perpl signals", "<%= config.bin %> perpl signals --markets BTC,ETH --lookback-hours 24 --json", "<%= config.bin %> perpl signals --skip-perps"];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:signals";

  async execute(io: CommandIO): Promise<SignalsResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const apiKey = (process.env.NANSEN_API_KEY ?? "").trim();
    if (!apiKey) throw new CommandError("NANSEN_API_KEY_MISSING", "NANSEN_API_KEY is not set.", "Create a key at app.nansen.ai and export NANSEN_API_KEY in the environment (never paste it in a chat).");
    const lookbackHours = intFlag(r.lookbackHours, "lookback-hours", { min: 1, max: 168 }) ?? 72;

    io.progress("Reading Perpl markets");
    const perpl = await fetchContext(chainId);
    const wanted = listFlag(r.markets).map((m) => m.toUpperCase());
    const markets = perpl.markets.filter((m) => m.config.is_open && (!wanted.length || wanted.includes(m.symbol.toUpperCase()))).map((m) => m.symbol);
    if (!markets.length) throw new CommandError("PERPL_UNKNOWN_MARKET", "None of the requested markets exist on Perpl.", `Available: ${perpl.markets.map((m) => m.symbol).join(", ")}.`);

    const credits: string[] = [];
    io.progress("Nansen: smart-money spot netflow");
    const nf = await fetchNetflow(apiKey, ["monad"]);
    if (nf.credits) credits.push(`netflow: ${nf.credits}`);
    let perpRows: Awaited<ReturnType<typeof fetchPerpTrades>>["rows"] = [];
    if (!r.skipPerps) {
      io.progress("Nansen: smart-money perp trades");
      const pt = await fetchPerpTrades(apiKey, lookbackHours);
      perpRows = pt.rows;
      if (pt.credits) credits.push(`perp-trades: ${pt.credits}`);
    }
    io.progress(undefined);

    const guard = loadGuard();
    const signals = computeSignals(markets, nf.rows, perpRows, guard).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    return {
      chainId,
      network: net.name,
      source: "nansen",
      lookbackHours,
      creditsSpent: credits,
      guard: { maxNotionalUsd: guard.maxNotionalUsd, maxLeverage: guard.maxLeverage },
      signals,
      disclaimer: "Smart-money flows are a signal, not a forecast. Suggestions are sized by your guard; the order command re-checks every limit and asks for confirmation.",
    };
  }

  override successHint(data: SignalsResult): string {
    const actionable = data.signals.filter((s) => s.suggestion);
    if (!actionable.length) return `No directional signal on ${data.signals.map((s) => s.market).join(", ")} right now (all neutral).`;
    const top = actionable[0];
    return `${actionable.length} idea(s). Strongest: ${top.market} ${top.bias} (score ${top.score}, ${top.confidence} confidence) → suggested ~$${top.suggestion!.notionalUsd} at ${top.suggestion!.leverage}x. Place with: mm perpl order --market ${top.market} --side ${top.bias} --notional-usd ${top.suggestion!.notionalUsd} --leverage ${top.suggestion!.leverage} --yes`;
  }
}
