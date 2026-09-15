import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { connect } from "../../lib/connect.js";
import { network } from "../../lib/perpl/config.js";
import { amountToHuman, round } from "../../lib/perpl/scale.js";
import { type PositionView, viewPosition } from "../../lib/positions.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  address: { type: InputFieldType.Text, flag: "address", message: "Wallet address (defaults to the active MetaMask wallet)", required: false, prompt: false },
} satisfies InputSchema;

export type PositionsResult = {
  chainId: number;
  network: string;
  wallet: string;
  account?: { id: number; balance: number; lockedBalance: number; collateral: string };
  positions: PositionView[];
  totals: { count: number; notional: number; unrealizedPnl: number };
  note: string;
};

export default class PerplPositions extends PluginCommand<PositionsResult> {
  static override description = "Open Perpl positions for the active wallet: size, entry vs mark, leverage, collateral, unrealized PnL, margin ratio and an estimated liquidation price. Read-only.";
  static override examples = ["<%= config.bin %> perpl positions", "<%= config.bin %> perpl positions --chain-id 10143 --json"];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:positions";

  async execute(io: CommandIO): Promise<PositionsResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    io.progress(`Connecting to Perpl ${net.name}`);
    const c = await connect(this.ctx, chainId, r.address);
    try {
      io.progress(undefined);
      const acc = c.session.account();
      const views = c.session.positions.map((p) => viewPosition(c.perpl, p, c.collateral)).filter((v): v is PositionView => Boolean(v));
      return {
        chainId,
        network: net.name,
        wallet: c.owner,
        account: acc ? { id: acc.id, balance: round(amountToHuman(acc.b, c.collateral.decimals), 2), lockedBalance: round(amountToHuman(acc.lb, c.collateral.decimals), 2), collateral: c.collateral.symbol } : undefined,
        positions: views,
        totals: {
          count: views.length,
          notional: round(views.reduce((s, v) => s + (v.notional ?? 0), 0), 2),
          unrealizedPnl: round(views.reduce((s, v) => s + (v.unrealizedPnl ?? 0), 0), 2),
        },
        note: "unrealizedPnl, marginRatio and liquidationPriceEstimate are first-order estimates from mark price and the market's published maintenance margin; funding and fees are not included.",
      };
    } finally {
      c.session.close();
    }
  }

  override successHint(data: PositionsResult): string {
    if (!data.positions.length) return `No open Perpl positions for ${data.wallet} on ${data.network}${data.account ? ` (balance ${data.account.balance} ${data.account.collateral})` : ""}.`;
    const worst = [...data.positions].filter((p) => p.liquidationDistancePct !== undefined).sort((a, b) => (a.liquidationDistancePct ?? 1) - (b.liquidationDistancePct ?? 1))[0];
    return `${data.totals.count} open position(s), notional $${data.totals.notional}, unrealized PnL $${data.totals.unrealizedPnl}.${worst ? ` Closest to liquidation: ${worst.market} ${worst.side}, ~${round((worst.liquidationDistancePct ?? 0) * 100, 1)}% away (estimate).` : ""}`;
  }
}
