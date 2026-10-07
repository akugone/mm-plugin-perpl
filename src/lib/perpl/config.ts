import { homedir } from "node:os";
import { join } from "node:path";

export type Network = {
  chainId: number;
  name: string;
  /** REST base, already ending in /api (targets below start with /v1/...). */
  api: string;
  /** WebSocket origin (paths /ws/v1/trading and /ws/v1/market-data are appended). */
  ws: string;
  explorer: string;
  appUrl: string;
  /** Public RPC for read-only simulation (mm's own client routes 10143 through a proxy that rejects it). */
  rpc: string;
};

export const NETWORKS: Record<number, Network> = {
  143: {
    chainId: 143,
    name: "Monad",
    api: "https://app.perpl.xyz/api",
    ws: "wss://app.perpl.xyz",
    explorer: "https://monadscan.com",
    appUrl: "https://app.perpl.xyz",
    rpc: "https://rpc.monad.xyz",
  },
  10143: {
    chainId: 10143,
    name: "Monad Testnet",
    api: "https://testnet.perpl.xyz/api",
    ws: "wss://testnet.perpl.xyz",
    explorer: "https://testnet.monadscan.com",
    appUrl: "https://testnet.perpl.xyz",
    rpc: "https://testnet-rpc.monad.xyz",
  },
};

export const DEFAULT_CHAIN_ID = Number(process.env.PERPL_CHAIN_ID) || 143;

/**
 * Origin header for API-key enrollment. Perpl only accepts whitelisted browser origins (an unknown one is a plain
 * HTTP 400 "Bad Request"); a request with NO Origin header — what a CLI naturally sends — is accepted. So the
 * header is omitted unless PERPL_ORIGIN is set (for integrators Perpl has whitelisted).
 */
export const ENROLL_ORIGIN: string | undefined = process.env.PERPL_ORIGIN?.trim() || undefined;

/** Where credentials, guard config and the order ledger live. 0700 dir, 0600 files. */
export function pluginHome(): string {
  return process.env.MM_PLUGIN_PERPL_HOME ?? join(homedir(), ".config", "mm-plugin-perpl");
}

export function network(chainId: number): Network {
  const n = NETWORKS[chainId];
  if (!n) {
    const known = Object.keys(NETWORKS).join(", ");
    throw new Error(`Perpl is not deployed on chain ${chainId}. Known chains: ${known}.`);
  }
  return n;
}
