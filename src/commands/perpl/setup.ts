import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { type Address, createPublicClient, encodeFunctionData, getAddress, http } from "viem";
import { type Executor, preflight, type ReadClient, settled, type StepResult, submitTransaction } from "../../lib/executor.js";
import { decimalFlag } from "../../lib/inputs.js";
import { network } from "../../lib/perpl/config.js";
import { erc20Abi, exchangeAbi } from "../../lib/perpl/contracts.js";
import { collateralToken, fetchContext, instanceOf } from "../../lib/perpl/rest.js";
import { amountToHuman, round } from "../../lib/perpl/scale.js";
import { parseChainId, resolveOwner } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  deposit: { type: InputFieldType.Text, flag: "deposit", message: "Initial collateral deposit in AUSD (creates the exchange account); at least Perpl's minimum", required: false, prompt: false },
  enableForwardingOnly: { type: InputFieldType.Boolean, flag: "enable-forwarding-only", message: "Only enable one-click trading (order forwarding) on an existing account", required: false, prompt: false, default: false },
  skipApprove: { type: InputFieldType.Boolean, flag: "skip-approve", message: "Skip the ERC-20 approve step (allowance already sufficient)", required: false, prompt: false, default: false },
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Show the transactions without sending", required: false, prompt: false, default: false },
} satisfies InputSchema;

export type SetupStep = { step: "approve" | "createAccount" | "allowOrderForwarding"; to: Address; calldata: `0x${string}`; summary: string } & StepResult & { skipped?: boolean };

export type SetupResult = {
  chainId: number;
  network: string;
  wallet: string;
  exchange: Address;
  collateral: { symbol: string; address: Address; decimals: number };
  minAccountOpen: number;
  deposit?: number;
  dryRun: boolean;
  steps: SetupStep[];
};

export default class PerplSetup extends PluginCommand<SetupResult> {
  static override description =
    "Create your Perpl exchange account with a first AUSD deposit and enable one-click trading — three transactions signed by your MetaMask wallet, each through MetaMask's policy, threat scan and 2FA. Or --enable-forwarding-only for an existing account.";
  static override examples = [
    "<%= config.bin %> perpl setup --chain-id 10143 --deposit 100",
    "<%= config.bin %> perpl setup --chain-id 10143 --deposit 100 --dry-run --json",
    "<%= config.bin %> perpl setup --chain-id 143 --enable-forwarding-only",
  ];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:setup";

  async execute(io: CommandIO): Promise<SetupResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const owner = resolveOwner(this.ctx);
    const deposit = decimalFlag(r.deposit, "deposit");
    if (!r.enableForwardingOnly && deposit === undefined) {
      throw new CommandError("MISSING_INPUT", "Give --deposit <AUSD> to create the account, or --enable-forwarding-only.", "Example: mm perpl setup --chain-id 10143 --deposit 100");
    }

    io.progress(`Reading Perpl ${net.name} contracts`);
    const perpl = await fetchContext(chainId);
    io.progress(undefined);
    const inst = instanceOf(perpl);
    const token = collateralToken(perpl, inst);
    const exchange = getAddress(inst.address);
    const tokenAddr = getAddress(token.address);
    const minOpen = amountToHuman(inst.min_account_open_amount, token.decimals);

    const steps: SetupStep[] = [];
    if (!r.enableForwardingOnly) {
      if (deposit! < minOpen) {
        throw new CommandError("PERPL_DEPOSIT_TOO_SMALL", `Perpl requires at least ${minOpen} ${token.symbol} to open an account; you passed ${deposit}.`, `Use --deposit ${minOpen} or more.`);
      }
      const amount = BigInt(Math.round(deposit! * 10 ** token.decimals));
      steps.push({
        step: "approve",
        to: tokenAddr,
        calldata: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [exchange, amount] }),
        summary: `Approve ${deposit} ${token.symbol} for the Perpl exchange (${exchange})`,
        skipped: Boolean(r.skipApprove),
      });
      steps.push({
        step: "createAccount",
        to: exchange,
        calldata: encodeFunctionData({ abi: exchangeAbi, functionName: "createAccount", args: [amount] }),
        summary: `Create a Perpl exchange account with ${deposit} ${token.symbol} of collateral`,
      });
    }
    steps.push({
      step: "allowOrderForwarding",
      to: exchange,
      calldata: encodeFunctionData({ abi: exchangeAbi, functionName: "allowOrderForwarding", args: [true] }),
      summary: "Enable one-click trading on Perpl (let the exchange forward API orders for this account)",
    });

    const result: SetupResult = {
      chainId,
      network: net.name,
      wallet: owner,
      exchange,
      collateral: { symbol: token.symbol, address: tokenAddr, decimals: token.decimals },
      minAccountOpen: round(minOpen, token.decimals),
      deposit,
      dryRun: Boolean(r.dryRun),
      steps,
    };
    if (r.dryRun) return result;

    const executor = (await this.ctx.walletExecutor(io, this.pluginCommandId)) as Executor;
    const client = createPublicClient({ transport: http(process.env.PERPL_RPC_URL || net.rpc) }) as unknown as ReadClient;
    let previous: string | undefined;
    for (const s of steps) {
      if (s.skipped) continue;
      io.progress(s.summary);
      await settled(client, previous);
      await preflight(client, owner as Address, { to: s.to, data: s.calldata }, s.summary);
      const out = await submitTransaction(executor, chainId, { to: s.to, data: s.calldata }, { action: "custom", summary: s.summary, details: { step: s.step, exchange } });
      io.progress(undefined);
      Object.assign(s, out);
      previous = out.hash;
      const terminalOk = out.hash || out.status === "CONFIRMED" || out.status === "BROADCASTED";
      if (!terminalOk) {
        // Stop at the first step that did not go through (MFA pending, denied, failed) — the next steps depend on it.
        return result;
      }
    }
    return result;
  }

  override successHint(data: SetupResult): string {
    if (data.dryRun) return `Dry run: ${data.steps.length} transaction(s) would be sent from ${data.wallet} on ${data.network}. Nothing sent.`;
    const pending = data.steps.find((s) => !s.skipped && !s.hash && s.pollingId);
    if (pending) return `Step '${pending.step}' is awaiting your MetaMask approval (2FA). Track: mm wallet requests watch ${pending.pollingId}. Re-run setup afterwards to continue.`;
    const failed = data.steps.find((s) => !s.skipped && !s.hash);
    if (failed) return `Step '${failed.step}' did not complete (${failed.status ?? "unknown"}${failed.failure ? `: ${failed.failure}` : ""}). Fix and re-run; completed steps can be skipped with --skip-approve / --enable-forwarding-only.`;
    return `Perpl account ready on ${data.network}: ${data.steps.filter((s) => !s.skipped).length} transaction(s) confirmed. Next: mm perpl enroll --chain-id ${data.chainId}, then mm perpl status.`;
  }
}
