import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { connect, requireTradingAccount } from "../../lib/connect.js";
import { loadGuard } from "../../lib/guard.js";
import { decimalFlag, intFlag } from "../../lib/inputs.js";
import { network } from "../../lib/perpl/config.js";
import { buildCloseOrder } from "../../lib/perpl/orders.js";
import { findMarket, markPrice } from "../../lib/perpl/rest.js";
import { fromScaled, round } from "../../lib/perpl/scale.js";
import { ORDER_FAILURE, ORDER_STATUS, ORDER_STATUS_REASON } from "../../lib/perpl/types.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  market: { type: InputFieldType.Text, flag: "market", message: "Market symbol of the position to close, e.g. BTC", required: true, prompt: true },
  size: { type: InputFieldType.Text, flag: "size", message: "Size to close in base units; omit to close the whole position", required: false, prompt: false },
  slippageBps: { type: InputFieldType.Text, flag: "slippage-bps", message: "Max market-order slippage in bps (default: market ceiling)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  yes: { type: InputFieldType.Boolean, flag: "yes", message: "Confirm (required in non-interactive mode when the guard requires confirmation)", required: false, prompt: false, default: false },
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Show the close order without sending it", required: false, prompt: false, default: false },
} satisfies InputSchema;

export type CloseResult = {
  chainId: number;
  network: string;
  market: string;
  positionId: number;
  side: "long" | "short";
  positionSize: number;
  closeSize: number;
  markPrice?: number;
  dryRun: boolean;
  rq?: number;
  accepted?: boolean;
  gateway?: { code: number; error?: string };
  status?: string;
  statusReason?: string;
  failureReason?: string;
  fillPrice?: number;
  filledSize?: number;
};

export default class PerplClose extends PluginCommand<CloseResult> {
  static override description = "Close an open Perpl position (fully or partially) with a market order. Closing reduces risk, so the guard's notional caps do not apply; confirmation still does.";
  static override examples = ["<%= config.bin %> perpl close --market BTC --yes", "<%= config.bin %> perpl close --market ETH --size 0.02 --yes", "<%= config.bin %> perpl close --market BTC --dry-run --json"];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:close";

  async execute(io: CommandIO): Promise<CloseResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const sizeIn = decimalFlag(r.size, "size");
    const slippageBps = intFlag(r.slippageBps, "slippage-bps", { min: 0, max: 10_000 });

    io.progress(`Connecting to Perpl ${net.name}`);
    const c = await connect(this.ctx, chainId);
    try {
      io.progress(undefined);
      const market = findMarket(c.perpl, r.market ?? "");
      const acc = requireTradingAccount(c);
      const position = c.session.positions.find((p) => p.mkt === market.id && p.acc === acc.id) ?? c.session.positions.find((p) => p.mkt === market.id);
      if (!position) throw new CommandError("PERPL_NO_POSITION", `No open ${market.symbol} position.`, "Run `mm perpl positions` to see what is open.");

      let frame;
      try {
        frame = buildCloseOrder({ market, position, size: sizeIn, slippageBps });
      } catch (e) {
        throw new CommandError("INVALID_INPUT", (e as Error).message, "Check --size against the open position.");
      }
      const side: "long" | "short" = position.sd === 1 ? "long" : "short";
      const mark = markPrice(market);
      const base: CloseResult = {
        chainId,
        network: net.name,
        market: market.symbol,
        positionId: position.pid,
        side,
        positionSize: round(fromScaled(position.s, market.config.size_decimals), market.config.size_decimals),
        closeSize: round(fromScaled(frame.s, market.config.size_decimals), market.config.size_decimals),
        markPrice: mark === undefined ? undefined : round(mark, market.config.price_decimals),
        dryRun: Boolean(r.dryRun),
      };
      if (r.dryRun) return base;

      if (loadGuard().requireConfirm && !r.yes) {
        const summary = `Close ${base.closeSize} of ${base.positionSize} ${market.symbol} ${side} at market on Perpl ${net.name}`;
        if (!io.isInteractive) throw new CommandError("CONFIRMATION_REQUIRED", `Confirmation required to: ${summary}.`, "Re-run with --yes after the user has agreed.");
        io.emit(`About to: ${summary}`);
        const ok = await io.resolveInputs({ confirm: { type: InputFieldType.Confirm, flag: "confirm", message: "Send this close order?", required: true, prompt: true } });
        if (!ok.confirm) throw new CommandError("CANCELLED", "Close cancelled by the user.", "Nothing was sent.");
      }

      io.progress("Sending close order to Perpl");
      const placed = await c.session.place(frame, acc.id);
      io.progress(undefined);
      const o = placed.order;
      return {
        ...base,
        rq: placed.rq,
        accepted: placed.accepted,
        gateway: placed.gateway,
        status: o ? ORDER_STATUS[o.st] ?? String(o.st) : placed.accepted ? "FORWARDED" : "REJECTED",
        statusReason: o?.sr ? ORDER_STATUS_REASON[o.sr] ?? `code ${o.sr}` : undefined,
        failureReason: o?.fr ? ORDER_FAILURE[o.fr] ?? `code ${o.fr}` : placed.accepted ? undefined : placed.gateway.error,
        fillPrice: o?.fp ? round(fromScaled(o.fp, market.config.price_decimals), market.config.price_decimals) : undefined,
        filledSize: o?.fs ? round(fromScaled(o.fs, market.config.size_decimals), market.config.size_decimals) : undefined,
      };
    } finally {
      c.session.close();
    }
  }

  override successHint(data: CloseResult): string {
    if (data.dryRun) return `Dry run: would close ${data.closeSize} of ${data.positionSize} ${data.market} ${data.side}. Nothing sent.`;
    if (data.accepted === false) return `Perpl gateway rejected the close: ${data.gateway?.error ?? `code ${data.gateway?.code}`}.`;
    if (data.status === "FILLED") return `Closed ${data.filledSize ?? data.closeSize} ${data.market} at ${data.fillPrice}.`;
    return `Close order forwarded (rq ${data.rq}, status ${data.status ?? "pending"}). Check mm perpl positions.`;
  }
}
