import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { connect, requireTradingAccount } from "../../lib/connect.js";
import { checkOrder, loadGuard, loadLedger, recordOrder } from "../../lib/guard.js";
import { decimalFlag, intFlag, sideFlag } from "../../lib/inputs.js";
import { network } from "../../lib/perpl/config.js";
import { buildOpenOrder, type Side } from "../../lib/perpl/orders.js";
import { fetchContext, findMarket, markPrice } from "../../lib/perpl/rest.js";
import { fromScaled, round } from "../../lib/perpl/scale.js";
import { ORDER_FAILURE, ORDER_STATUS, ORDER_STATUS_REASON } from "../../lib/perpl/types.js";
import { loadCredentials } from "../../lib/perpl/store.js";
import { parseChainId, resolveOwner } from "../../lib/wallet.js";

const inputs = {
  market: { type: InputFieldType.Text, flag: "market", message: "Market symbol, e.g. BTC, ETH, SOL (see `mm perpl markets`)", required: true, prompt: true },
  side: { type: InputFieldType.Text, flag: "side", message: "long or short", required: true, prompt: true },
  size: { type: InputFieldType.Text, flag: "size", message: "Size in base units, e.g. 0.01 (BTC). Give --size or --notional-usd", required: false, prompt: false },
  notionalUsd: { type: InputFieldType.Text, flag: "notional-usd", message: "Position notional in collateral (~USD); size is derived from the mark price", required: false, prompt: false },
  leverage: { type: InputFieldType.Text, flag: "leverage", message: "Leverage, e.g. 2 (default 1)", required: false, prompt: false },
  price: { type: InputFieldType.Text, flag: "price", message: "Limit price; omit for a market order", required: false, prompt: false },
  postOnly: { type: InputFieldType.Boolean, flag: "post-only", message: "Post-only (limit orders)", required: false, prompt: false, default: false },
  slippageBps: { type: InputFieldType.Text, flag: "slippage-bps", message: "Max market-order slippage in bps (default: market ceiling)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  yes: { type: InputFieldType.Boolean, flag: "yes", message: "Confirm the order (required in non-interactive mode when the guard requires confirmation)", required: false, prompt: false, default: false },
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Run every check and show the order frame without sending it", required: false, prompt: false, default: false },
} satisfies InputSchema;

export type OrderResult = {
  chainId: number;
  network: string;
  wallet: string;
  /** Absent on a dry run before enrollment: the guard and the frame are checked on public data only. */
  accountId?: number;
  market: string;
  side: Side;
  size: number;
  notionalUsd: number;
  leverage: number;
  orderType: "market" | "limit";
  price?: number;
  markPrice: number;
  guard: { ok: boolean; violations: string[]; usedDailyNotionalUsd: number };
  dryRun: boolean;
  frame?: Record<string, unknown>;
  rq?: number;
  accepted?: boolean;
  gateway?: { code: number; error?: string };
  status?: string;
  statusReason?: string;
  failureReason?: string;
  fillPrice?: number;
  filledSize?: number;
  orderId?: number;
};

export default class PerplOrder extends PluginCommand<OrderResult> {
  static override description =
    "Open a perpetual position on Perpl through the wallet-enrolled API key. Every order is checked against the plugin's guard (notional, leverage, rolling 24h cap, open positions, allowed markets) and confirmed (--yes or interactive) before it is sent. Orders are forwarded by the exchange; MetaMask's policy does not see them — the guard is the safety net.";
  static override examples = [
    "<%= config.bin %> perpl order --market BTC --side long --notional-usd 50 --leverage 2 --yes",
    "<%= config.bin %> perpl order --market ETH --side short --size 0.05 --price 3200 --post-only --yes",
    "<%= config.bin %> perpl order --market BTC --side long --notional-usd 50 --dry-run --json",
  ];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:order";

  async execute(io: CommandIO): Promise<OrderResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const side = sideFlag(r.side);
    const leverage = decimalFlag(r.leverage, "leverage") ?? 1;
    const sizeIn = decimalFlag(r.size, "size");
    const notionalIn = decimalFlag(r.notionalUsd, "notional-usd");
    if (sizeIn === undefined && notionalIn === undefined) throw new CommandError("MISSING_INPUT", "Give --size or --notional-usd.", "Example: --notional-usd 50");
    if (sizeIn !== undefined && notionalIn !== undefined) throw new CommandError("INVALID_INPUT", "Give either --size or --notional-usd, not both.", "Drop one of them.");
    const price = decimalFlag(r.price, "price");
    const slippageBps = intFlag(r.slippageBps, "slippage-bps", { min: 0, max: 10_000 });

    // Pre-flight on public data: the guard refuses before any key is loaded, and a dry run works before enrollment.
    const owner = resolveOwner(this.ctx);
    io.progress(`Reading Perpl ${net.name} markets`);
    const pub = await fetchContext(chainId);
    io.progress(undefined);
    const pre = sizeOrder(pub, r.market ?? "", sizeIn, notionalIn, price);
    const guardCfg = loadGuard();
    const preVerdict = checkOrder(guardCfg, loadLedger(), { chainId, market: pre.market.symbol, notionalUsd: pre.notional, leverage, openPositions: 0, opensNewPosition: true });
    if (!preVerdict.ok) throw guardBlocked(preVerdict.violations);
    if (r.dryRun && !loadCredentials(chainId, owner)) {
      const frame = frameOrThrow(pre.market, side, pre.size, leverage, price, Boolean(r.postOnly), slippageBps);
      return {
        chainId,
        network: net.name,
        wallet: owner,
        market: pre.market.symbol,
        side,
        size: round(fromScaled(frame.s, pre.market.config.size_decimals), pre.market.config.size_decimals),
        notionalUsd: round(pre.notional, 2),
        leverage,
        orderType: price === undefined ? "market" : "limit",
        price,
        markPrice: round(pre.mark, pre.market.config.price_decimals),
        guard: { ok: true, violations: [], usedDailyNotionalUsd: round(preVerdict.usedDailyNotionalUsd, 2) },
        dryRun: true,
        frame: { ...frame },
      };
    }

    io.progress(`Connecting to Perpl ${net.name}`);
    const c = await connect(this.ctx, chainId);
    try {
      io.progress(undefined);
      const { market, mark, size, notional } = sizeOrder(c.perpl, r.market ?? "", sizeIn, notionalIn, price);

      const acc = requireTradingAccount(c);
      const ledger = loadLedger();
      const alreadyOpen = c.session.positions.some((p) => p.mkt === market.id && (p.sd === 1) === (side === "long"));
      const verdict = checkOrder(guardCfg, ledger, { chainId, market: market.symbol, notionalUsd: notional, leverage, openPositions: c.session.positions.length, opensNewPosition: !alreadyOpen });

      const frame = frameOrThrow(market, side, size, leverage, price, Boolean(r.postOnly), slippageBps);

      const base: OrderResult = {
        chainId,
        network: net.name,
        wallet: c.owner,
        accountId: acc.id,
        market: market.symbol,
        side,
        size: round(fromScaled(frame.s, market.config.size_decimals), market.config.size_decimals),
        notionalUsd: round(notional, 2),
        leverage,
        orderType: price === undefined ? "market" : "limit",
        price,
        markPrice: round(mark, market.config.price_decimals),
        guard: { ok: verdict.ok, violations: verdict.violations, usedDailyNotionalUsd: round(verdict.usedDailyNotionalUsd, 2) },
        dryRun: Boolean(r.dryRun),
        frame: { ...frame, acc: acc.id },
      };

      if (!verdict.ok) throw guardBlocked(verdict.violations);
      if (r.dryRun) return base;

      if (guardCfg.requireConfirm && !r.yes) {
        const summary = `${side.toUpperCase()} ${base.size} ${market.symbol} (~$${base.notionalUsd}) at ${leverage}x, ${base.orderType}${price !== undefined ? ` @ ${price}` : ` (mark ${base.markPrice})`} on Perpl ${net.name}`;
        if (!io.isInteractive) {
          throw new CommandError("CONFIRMATION_REQUIRED", `Confirmation required to place: ${summary}.`, "Re-run with --yes after the user has agreed to exactly this order, or disable confirmation with `mm perpl guard --require-confirm false`.");
        }
        io.emit(`About to place: ${summary}`);
        const ok = await io.resolveInputs({ confirm: { type: InputFieldType.Confirm, flag: "confirm", message: "Send this order to Perpl?", required: true, prompt: true } });
        if (!ok.confirm) throw new CommandError("CANCELLED", "Order cancelled by the user.", "Nothing was sent.");
      }

      io.progress("Sending order to Perpl");
      const placed = await c.session.place(frame, acc.id);
      io.progress(undefined);
      if (placed.accepted) {
        recordOrder({ ts: Date.now(), chainId, market: market.symbol, notionalUsd: notional, rq: placed.rq });
      }
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
        orderId: o?.oid,
      };
    } finally {
      c.session.close();
    }
  }

  override successHint(data: OrderResult): string {
    const what = `${data.side} ${data.size} ${data.market} (~$${data.notionalUsd}, ${data.leverage}x)`;
    if (data.dryRun && data.accountId === undefined) return `Dry run (not enrolled yet): guard OK on public market data. Would place ${what} as a ${data.orderType} order. Nothing sent. Open positions are re-checked once enrolled: mm perpl setup, then mm perpl enroll.`;
    if (data.dryRun) return `Dry run: guard OK ($${data.guard.usedDailyNotionalUsd} of the 24h cap used). Would place ${what} as a ${data.orderType} order. Nothing sent.`;
    if (data.accepted === false) return `Perpl gateway rejected ${what}: ${data.gateway?.error ?? `code ${data.gateway?.code}`}. Nothing was forwarded.`;
    if (data.status === "FILLED") return `Filled: ${what} at ${data.fillPrice} (order ${data.orderId}). Check with mm perpl positions.`;
    if (data.status === "FAILED") return `Order ${what} failed on chain: ${data.failureReason ?? data.statusReason ?? "unknown"}. Nothing is open.`;
    return `Order ${what} forwarded (rq ${data.rq}, status ${data.status ?? "pending"}). Check mm perpl positions in a few seconds.`;
  }
}

function sizeOrder(perpl: Parameters<typeof findMarket>[0], symbol: string, sizeIn: number | undefined, notionalIn: number | undefined, price: number | undefined) {
  const market = findMarket(perpl, symbol);
  if (!market.config.is_open) throw new CommandError("PERPL_MARKET_CLOSED", `${market.symbol} is not open for trading right now.`, "Pick another market or retry later.");
  const mark = markPrice(market);
  if (mark === undefined) throw new CommandError("PERPL_NO_MARK", `No mark price for ${market.symbol} yet.`, "Retry in a few seconds.");
  const refPrice = price ?? mark;
  const size = sizeIn ?? notionalIn! / refPrice;
  return { market, mark, size, notional: size * refPrice };
}

function frameOrThrow(market: ReturnType<typeof findMarket>, side: Side, size: number, leverage: number, price: number | undefined, postOnly: boolean, slippageBps: number | undefined) {
  try {
    return buildOpenOrder({ market, side, size, leverage, price, postOnly, slippageBps });
  } catch (e) {
    throw new CommandError("INVALID_INPUT", (e as Error).message, `Check --size / --price against ${market.symbol}'s decimals (size ${market.config.size_decimals}, price ${market.config.price_decimals}).`);
  }
}

function guardBlocked(violations: string[]): CommandError {
  return new CommandError("GUARD_BLOCKED", `Order refused by the plugin guard: ${violations.join("; ")}.`, "Reduce the order, or raise the limit deliberately with `mm perpl guard --max-notional-usd …` (that is a decision, not a retry).");
}
