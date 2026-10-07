/**
 * Thin typed wrappers over the host's wallet executor. Every call here is a MetaMask-signed operation and goes
 * through MetaMask's own pipeline (policy, simulation, Blockaid, 2FA). String discriminators mirror the host
 * ("transaction" / "typed-data" requests, "transaction" / "signature" results).
 */
import { CommandError } from "@metamask/agent-wallet/plugin";
import type { Address, Hex } from "viem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Executor = (req: any, opts?: any) => Promise<any>;

/** The slice of the host's viem public client the pre-flight needs (ctx.publicClient(chainId)). */
export type ReadClient = {
  call(args: { account: Address; to: Address; data: Hex }): Promise<unknown>;
  waitForTransactionReceipt(args: { hash: Hex; timeout?: number }): Promise<unknown>;
};

const KNOWN_REVERTS: Record<string, { why: string; hint: string }> = {
  "0xfb8f41b2": { why: "the AUSD allowance is too low (ERC20InsufficientAllowance)", hint: "Run it again without --skip-approve: the approve step sets the allowance." },
  "0xe450d38c": { why: "the wallet's AUSD balance is too low (ERC20InsufficientBalance)", hint: "Fund the agent wallet with AUSD first; check with mm wallet balance." },
  "0x03a0e277": { why: "this wallet has no Perpl exchange account (AccountDoesNotExist)", hint: "Run mm perpl setup --deposit <AUSD> first." },
};

/** Finds the revert payload in a viem/JSON-RPC error chain, if the failure was a revert at all. */
export function revertData(e: unknown): Hex | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 8 && cur; depth++) {
    const c = cur as { data?: unknown; cause?: unknown };
    if (typeof c.data === "string" && /^0x[0-9a-fA-F]{8}/.test(c.data)) return c.data as Hex;
    const inner = (c.data as { data?: unknown } | undefined)?.data;
    if (typeof inner === "string" && /^0x[0-9a-fA-F]{8}/.test(inner)) return inner as Hex;
    cur = c.cause;
  }
  return undefined;
}

/**
 * Simulates a wallet transaction from the agent wallet before handing it to MetaMask. A transaction that would revert
 * is stopped here with the decoded reason; otherwise mm falls back to a huge gas limit and reports a misleading
 * "insufficient native balance". RPC failures that are not reverts are left to MetaMask's own pipeline.
 */
export async function preflight(client: ReadClient, from: Address, tx: { to: Address; data: Hex }, summary: string): Promise<void> {
  try {
    await client.call({ account: from, to: tx.to, data: tx.data });
  } catch (e) {
    const data = revertData(e);
    const reverted = data !== undefined || /revert/i.test(String((e as Error)?.message ?? ""));
    if (!reverted) return;
    const known = data ? KNOWN_REVERTS[data.slice(0, 10).toLowerCase()] : undefined;
    throw new CommandError(
      "TX_WOULD_REVERT",
      `${summary}: this transaction would fail on chain (${known?.why ?? (data ? `custom error ${data.slice(0, 10)}` : "execution reverted")}). Nothing was signed or sent.`,
      known?.hint ?? "Check the inputs and the wallet's balances, then try again.",
    );
  }
}

/** Waits for a previous step to land so the next step's pre-flight sees its effect (an approval, a new account). */
export async function settled(client: ReadClient, hash: string | undefined): Promise<void> {
  if (!hash) return;
  try {
    await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 60_000 });
  } catch {
    // MetaMask's pipeline still guards the next step; the pre-flight just loses its view of this one.
  }
}

export type StepResult = {
  status?: string;
  hash?: string;
  signature?: string;
  pollingId?: string;
  failure?: string;
};

export type Intent = { summary: string; action: "custom"; details?: Record<string, unknown> };

export async function submitTransaction(executor: Executor, chainId: number, tx: { to: Address; data: Hex; value?: bigint }, intent: Intent): Promise<StepResult> {
  let result;
  try {
    result = await executor({
      kind: "transaction",
      chainId,
      transaction: { to: tx.to, data: tx.data, value: tx.value ?? 0n },
      intent,
    });
  } catch (e) {
    throw rpcConfigError(e, chainId) ?? e;
  }
  return {
    status: result.status,
    hash: result.kind === "transaction" ? result.hash || undefined : undefined,
    pollingId: result.pendingJob?.pollingId,
    failure: result.failureDescription,
  };
}

export type TypedData = { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType?: string; message: Record<string, unknown> };

/** EIP-712 signature by the MetaMask wallet. The executor waits for the signature (or an MFA denial). */
export async function signTypedData(executor: Executor, chainId: number, typedData: TypedData, intent: Intent): Promise<StepResult> {
  const result = await executor({ kind: "typed-data", chainId, typedData, intent });
  return {
    status: result.status,
    signature: result.kind === "signature" ? result.signature || undefined : undefined,
    pollingId: result.pendingJob?.pollingId,
    failure: result.failureDescription,
  };
}

/**
 * mm routes RPC for chains without an rpcTarget through MetaMask's Infura proxy, which answers "Invalid chainId" for
 * Monad Testnet (gas estimation fails before anything is signed). The fix is a customEvmChains entry with a public RPC.
 */
export function rpcConfigError(e: unknown, chainId: number): CommandError | undefined {
  const text = `${(e as Error)?.message ?? ""} ${JSON.stringify((e as { data?: unknown })?.data ?? "")} ${String((e as { cause?: unknown })?.cause ?? "")}`;
  if (!/Invalid chainId|Non-200 status code: '400'|Gas fee\/price estimation failed/i.test(text)) return undefined;
  return new CommandError(
    "MM_CHAIN_RPC_UNAVAILABLE",
    `mm could not estimate gas on chain ${chainId}: MetaMask's RPC proxy does not serve this chain. Nothing was signed or sent.`,
    chainId === 10143
      ? "Add Monad Testnet with a public RPC to mm's customEvmChains (see README › Monad Testnet RPC), then re-run."
      : `Add chain ${chainId} with a public RPC (rpcTarget) to mm's customEvmChains, then re-run.`,
  );
}
