import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { network } from "../../lib/perpl/config.js";
import { collateralToken, fetchContext, markPrice } from "../../lib/perpl/rest.js";
import { fromScaled, round } from "../../lib/perpl/scale.js";
import { parseChainId } from "../../lib/wallet.js";

const inputs = {
  chainId: {
    type: InputFieldType.Text,
    flag: "chain-id",
    message: "Chain id: 143 (Monad) or 10143 (Monad Testnet). Defaults to PERPL_CHAIN_ID or 143",
    required: false,
    prompt: false,
  },
} satisfies InputSchema;

export type MarketRow = {
  id: number;
  symbol: string;
  name: string;
  open: boolean;
  markPrice?: number;
  bid?: number;
  ask?: number;
  change24hPct?: number;
  openInterest?: number;
  fundingRateRaw?: number;
  priceDecimals: number;
  sizeDecimals: number;
  makerFeeBps: number;
  takerFeeBps: number;
  maxSlippageBps: number;
  orderTtlBlocks: number;
  maintenanceMarginRaw: number;
};

export type MarketsResult = { chainId: number; network: string; collateral: string; exchange: string; markets: MarketRow[] };

export default class PerplMarkets extends PluginCommand<MarketsResult> {
  static override description = "List Perpl perpetual markets on Monad with mark price, funding and fee tiers. Public data, no wallet needed.";
  static override examples = ["<%= config.bin %> perpl markets", "<%= config.bin %> perpl markets --chain-id 10143 --json"];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:markets";

  async execute(io: CommandIO): Promise<MarketsResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    io.progress(`Fetching Perpl ${net.name} markets`);
    const ctx = await fetchContext(chainId);
    io.progress(undefined);
    const collateral = collateralToken(ctx);
    const markets: MarketRow[] = ctx.markets.map((m) => {
      const pd = m.config.price_decimals;
      const mark = markPrice(m);
      const prev = m.state?.prv !== undefined ? fromScaled(m.state.prv, pd) : undefined;
      return {
        id: m.id,
        symbol: m.symbol,
        name: m.name,
        open: Boolean(m.config.is_open),
        markPrice: mark === undefined ? undefined : round(mark, pd),
        bid: m.state?.bid === undefined ? undefined : round(fromScaled(m.state.bid, pd), pd),
        ask: m.state?.ask === undefined ? undefined : round(fromScaled(m.state.ask, pd), pd),
        change24hPct: mark !== undefined && prev ? round(((mark - prev) / prev) * 100, 2) : undefined,
        openInterest: m.state?.oi === undefined ? undefined : round(fromScaled(m.state.oi, m.config.size_decimals), m.config.size_decimals),
        fundingRateRaw: m.funding?.rate,
        priceDecimals: pd,
        sizeDecimals: m.config.size_decimals,
        makerFeeBps: m.config.maker_fee,
        takerFeeBps: m.config.taker_fee,
        maxSlippageBps: m.order_max_market_slippage_bps,
        orderTtlBlocks: m.order_ttl_blocks,
        maintenanceMarginRaw: m.config.maintenance_margin,
      };
    });
    return { chainId, network: net.name, collateral: collateral.symbol, exchange: ctx.instances[0]?.address ?? "", markets };
  }

  override successHint(data: MarketsResult): string {
    const open = data.markets.filter((m) => m.open).length;
    return `${data.markets.length} Perpl markets on ${data.network} (${open} open), collateral ${data.collateral}. Place an order with \`mm perpl order --market <SYMBOL> --side long|short --notional-usd <n>\`.`;
  }
}
