import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { connect } from "../../lib/connect.js";
import { decimalFlag } from "../../lib/inputs.js";
import { network } from "../../lib/perpl/config.js";
import { amountToHuman, round } from "../../lib/perpl/scale.js";
import { type Alert, assessRisk, DEFAULT_RISK, type PositionView, viewPosition } from "../../lib/positions.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  address: { type: InputFieldType.Text, flag: "address", message: "Wallet address (defaults to the active MetaMask wallet)", required: false, prompt: false },
  minMarginRatio: { type: InputFieldType.Text, flag: "min-margin-ratio", message: "Alert when (collateral + uPnL) / notional falls below this (default 0.1)", required: false, prompt: false },
  maxLossPct: { type: InputFieldType.Text, flag: "max-loss-pct", message: "Alert when unrealized loss exceeds this % of a position's collateral (default 50)", required: false, prompt: false },
  minLiqDistancePct: { type: InputFieldType.Text, flag: "min-liq-distance-pct", message: "Alert when the estimated liquidation price is closer than this % of mark (default 10)", required: false, prompt: false },
} satisfies InputSchema;

export type RiskResult = {
  chainId: number;
  network: string;
  wallet: string;
  checkedAt: string;
  account?: { id: number; balance: number; collateral: string };
  thresholds: { minMarginRatio: number; maxLossPct: number; minLiquidationDistancePct: number };
  positions: PositionView[];
  alerts: Alert[];
  ok: boolean;
  summary: string;
};

export default class PerplRisk extends PluginCommand<RiskResult> {
  static override description =
    "Risk check on open Perpl positions, built for cron: margin ratio, unrealized loss vs collateral, distance to the estimated liquidation price. Returns `ok: false` with an `alerts` list when a threshold is crossed. Read-only.";
  static override examples = [
    "<%= config.bin %> perpl risk --json",
    "<%= config.bin %> perpl risk --min-margin-ratio 0.15 --max-loss-pct 30 --json",
    "<%= config.bin %> perpl risk --chain-id 10143",
  ];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:risk";

  async execute(io: CommandIO): Promise<RiskResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const thresholds = {
      minMarginRatio: decimalFlag(r.minMarginRatio, "min-margin-ratio") ?? DEFAULT_RISK.minMarginRatio,
      maxLossPct: decimalFlag(r.maxLossPct, "max-loss-pct") ?? DEFAULT_RISK.maxLossPct,
      minLiquidationDistancePct: (decimalFlag(r.minLiqDistancePct, "min-liq-distance-pct") ?? DEFAULT_RISK.minLiquidationDistancePct * 100) / 100,
    };
    io.progress(`Connecting to Perpl ${net.name}`);
    const c = await connect(this.ctx, chainId, r.address);
    try {
      io.progress(undefined);
      const acc = c.session.account();
      const positions = c.session.positions.map((p) => viewPosition(c.perpl, p, c.collateral)).filter((v): v is PositionView => Boolean(v));
      const alerts = assessRisk(positions, thresholds);
      const critical = alerts.filter((a) => a.level === "critical").length;
      const summary = positions.length === 0
        ? "No open positions."
        : alerts.length === 0
          ? `${positions.length} position(s), all within thresholds.`
          : `${alerts.length} alert(s) (${critical} critical) on ${new Set(alerts.map((a) => a.market)).size} market(s): ${alerts.map((a) => `${a.market} ${a.reason}`).join("; ")}.`;
      return {
        chainId,
        network: net.name,
        wallet: c.owner,
        checkedAt: new Date().toISOString(),
        account: acc ? { id: acc.id, balance: round(amountToHuman(acc.b, c.collateral.decimals), 2), collateral: c.collateral.symbol } : undefined,
        thresholds,
        positions,
        alerts,
        ok: alerts.length === 0,
        summary,
      };
    } finally {
      c.session.close();
    }
  }

  override successHint(data: RiskResult): string {
    return data.ok ? `Risk OK — ${data.summary}` : `RISK ALERT — ${data.summary} Consider \`mm perpl close --market <SYMBOL>\`.`;
  }
}
