/**
 * Thin typed wrappers over the host's wallet executor. Every call here is a MetaMask-signed operation and goes
 * through MetaMask's own pipeline (policy, simulation, Blockaid, 2FA). String discriminators mirror the host
 * ("transaction" / "typed-data" requests, "transaction" / "signature" results).
 */
import { CommandError } from "@metamask/agent-wallet/plugin";
import type { Address, Hex } from "viem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Executor = (req: any, opts?: any) => Promise<any>;

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
