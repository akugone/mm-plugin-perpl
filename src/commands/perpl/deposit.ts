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
  amount: { type: InputFieldType.Text, flag: "amount", message: "AUSD to add to an existing Perpl account; at least Perpl's minimum deposit", required: true, prompt: false },
  skipApprove: { type: InputFieldType.Boolean, flag: "skip-approve", message: "Skip the ERC-20 approve step (allowance already sufficient)", required: false, prompt: false, default: false },
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Show the transactions without sending", required: false, prompt: false, default: false },
} satisfies InputSchema;

export type DepositStep = { step: "approve" | "depositCollateral"; to: Address; calldata: `0x${string}`; summary: string } & StepResult & { skipped?: boolean };

export type DepositResult = {
  chainId: number;
  network: string;
  wallet: string;
  exchange: Address;
  collateral: { symbol: string; address: Address; decimals: number };
  minDeposit: number;
  amount: number;
  dryRun: boolean;
  steps: DepositStep[];
};

export default class PerplDeposit extends PluginCommand<DepositResult> {
  static override description =
    "Add AUSD collateral to an existing Perpl account — approve + depositCollateral, both signed by your MetaMask wallet through its policy, threat scan and 2FA. To open the account, use `perpl setup`.";
  static override examples = [
    "<%= config.bin %> perpl deposit --chain-id 10143 --amount 50",
    "<%= config.bin %> perpl deposit --chain-id 10143 --amount 50 --dry-run --json",
  ];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:deposit";

  async execute(io: CommandIO): Promise<DepositResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const owner = resolveOwner(this.ctx);
    const amountHuman = decimalFlag(r.amount, "amount");
    if (amountHuman === undefined) {
      throw new CommandError("MISSING_INPUT", "Give --amount <AUSD>.", "Example: mm perpl deposit --chain-id 10143 --amount 50");
    }

    io.progress(`Reading Perpl ${net.name} contracts`);
    const perpl = await fetchContext(chainId);
    io.progress(undefined);
    const inst = instanceOf(perpl);
    const token = collateralToken(perpl, inst);
    const exchange = getAddress(inst.address);
    const tokenAddr = getAddress(token.address);
    const minDeposit = amountToHuman(inst.min_deposit_amount, token.decimals);
    if (amountHuman < minDeposit) {
      throw new CommandError("PERPL_DEPOSIT_TOO_SMALL", `Perpl's minimum deposit is ${minDeposit} ${token.symbol}; you passed ${amountHuman}.`, `Use --amount ${minDeposit} or more.`);
    }
    const amount = BigInt(Math.round(amountHuman * 10 ** token.decimals));

    const steps: DepositStep[] = [
      {
        step: "approve",
        to: tokenAddr,
        calldata: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [exchange, amount] }),
        summary: `Approve ${amountHuman} ${token.symbol} for the Perpl exchange (${exchange})`,
        skipped: Boolean(r.skipApprove),
      },
      {
        step: "depositCollateral",
        to: exchange,
        calldata: encodeFunctionData({ abi: exchangeAbi, functionName: "depositCollateral", args: [amount] }),
        summary: `Deposit ${amountHuman} ${token.symbol} of collateral into your Perpl account`,
      },
    ];

    const result: DepositResult = {
      chainId,
      network: net.name,
      wallet: owner,
      exchange,
      collateral: { symbol: token.symbol, address: tokenAddr, decimals: token.decimals },
      minDeposit: round(minDeposit, token.decimals),
      amount: amountHuman,
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
      if (!(out.hash || out.status === "CONFIRMED" || out.status === "BROADCASTED")) return result;
    }
    return result;
  }

  override successHint(data: DepositResult): string {
    if (data.dryRun) return `Dry run: ${data.steps.filter((s) => !s.skipped).length} transaction(s) would be sent from ${data.wallet} on ${data.network}. Nothing sent.`;
    const pending = data.steps.find((s) => !s.skipped && !s.hash && s.pollingId);
    if (pending) return `Step '${pending.step}' is awaiting your MetaMask approval (2FA). Track: mm wallet requests watch ${pending.pollingId}. Re-run with --skip-approve afterwards if the approve went through.`;
    const failed = data.steps.find((s) => !s.skipped && !s.hash);
    if (failed) return `Step '${failed.step}' did not complete (${failed.status ?? "unknown"}${failed.failure ? `: ${failed.failure}` : ""}).`;
    return `Deposited ${data.amount} ${data.collateral.symbol} on ${data.network}. Check: mm perpl status --chain-id ${data.chainId}.`;
  }
}
