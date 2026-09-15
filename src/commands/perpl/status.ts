import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { loadGuard, loadLedger, rolling24hNotional, type GuardConfig } from "../../lib/guard.js";
import { network } from "../../lib/perpl/config.js";
import { collateralToken, fetchContext } from "../../lib/perpl/rest.js";
import { amountToHuman, round } from "../../lib/perpl/scale.js";
import { loadCredentials } from "../../lib/perpl/store.js";
import { TradingSession } from "../../lib/perpl/ws.js";
import { parseChainId, resolveOwner } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  address: { type: InputFieldType.Text, flag: "address", message: "Wallet address (defaults to the active MetaMask wallet)", required: false, prompt: false },
} satisfies InputSchema;

export type StatusResult = {
  chainId: number;
  network: string;
  wallet: string;
  enrolled: boolean;
  keyLabel?: string;
  keySource?: "enroll" | "env";
  account?: { id: number; balance: number; lockedBalance: number; forwardingEnabled: boolean; frozen: boolean; feeTier: number; collateral: string };
  openPositions?: number;
  guard: GuardConfig & { usedDailyNotionalUsd: number };
  ready: boolean;
  nextStep: string;
};

export default class PerplStatus extends PluginCommand<StatusResult> {
  static override description = "Where you stand: wallet, enrolled Perpl API key, exchange account (balance, one-click trading), open positions, and the plugin's guard. Tells you the exact next step.";
  static override examples = ["<%= config.bin %> perpl status", "<%= config.bin %> perpl status --chain-id 10143 --json"];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:status";

  async execute(io: CommandIO): Promise<StatusResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const owner = resolveOwner(this.ctx, r.address);
    const guardCfg = loadGuard();
    const guard = { ...guardCfg, usedDailyNotionalUsd: round(rolling24hNotional(loadLedger(), chainId), 2) };
    const creds = loadCredentials(chainId, owner);

    const base: StatusResult = { chainId, network: net.name, wallet: owner, enrolled: Boolean(creds), keyLabel: creds?.label, keySource: creds?.source, guard, ready: false, nextStep: "" };
    if (!creds) {
      base.nextStep = `Enroll a trade-scoped Perpl API key signed by this wallet: mm perpl enroll --chain-id ${chainId}`;
      return base;
    }

    io.progress(`Connecting to Perpl ${net.name}`);
    const perpl = await fetchContext(chainId);
    const collateral = collateralToken(perpl);
    const session = await TradingSession.open(chainId, creds);
    io.progress(undefined);
    try {
      const acc = session.account();
      base.openPositions = session.positions.length;
      if (!acc) {
        base.nextStep = `No exchange account yet. Create one with a first deposit: mm perpl setup --chain-id ${chainId} --deposit <${collateral.symbol} amount>`;
        return base;
      }
      base.account = {
        id: acc.id,
        balance: round(amountToHuman(acc.b, collateral.decimals), 2),
        lockedBalance: round(amountToHuman(acc.lb, collateral.decimals), 2),
        forwardingEnabled: Boolean(acc.fw),
        frozen: Boolean(acc.fr),
        feeTier: acc.ft,
        collateral: collateral.symbol,
      };
      if (acc.fr) {
        base.nextStep = "Account is frozen; contact Perpl support.";
      } else if (!acc.fw) {
        base.nextStep = `Enable one-click trading (order forwarding) so API orders are accepted: mm perpl setup --enable-forwarding-only --chain-id ${chainId}`;
      } else {
        base.ready = true;
        base.nextStep = `Ready. Check ideas with mm perpl signals, then place an order under the guard (max $${guardCfg.maxNotionalUsd}/order, ${guardCfg.maxLeverage}x, $${guardCfg.maxDailyNotionalUsd}/24h).`;
      }
      return base;
    } finally {
      session.close();
    }
  }

  override successHint(data: StatusResult): string {
    return data.ready ? `Perpl ${data.network}: account ${data.account?.id}, ${data.account?.balance} ${data.account?.collateral}, ${data.openPositions ?? 0} open position(s). ${data.nextStep}` : `Not ready — ${data.nextStep}`;
  }
}
