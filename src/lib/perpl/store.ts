/**
 * Local credential store: one enrolled Perpl API key per (chain, wallet address).
 *
 * The only secret this plugin ever holds is the Ed25519 seed of a `trade`-scoped API key. It cannot withdraw
 * (Perpl never allows withdrawals via API keys) and it is revocable from the Perpl web UI. It never goes
 * through argv; the file is 0600 in a 0700 directory. PERPL_API_KEY + PERPL_API_KEY_SECRET in the environment
 * override the file (for CI or a key created in the web UI).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CommandError } from "@metamask/agent-wallet/plugin";
import type { ApiCredentials } from "./auth.js";
import { pluginHome } from "./config.js";

export type StoredCredentials = ApiCredentials & {
  chainId: number;
  address: string;
  publicKeyHex: string;
  label: string;
  scopeMask: number;
  createdAt: string;
  expiresAt?: number;
  source: "enroll" | "env";
};

type CredentialFile = { version: 1; keys: Record<string, StoredCredentials> };

export function credentialKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export function credentialsPath(dir: string = pluginHome()): string {
  return join(dir, "credentials.json");
}

export function ensureHome(dir: string = pluginHome()): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write, 0600. */
export function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function loadAllCredentials(dir: string = pluginHome()): CredentialFile {
  return readJson<CredentialFile>(credentialsPath(dir), { version: 1, keys: {} });
}

export function saveCredentials(creds: StoredCredentials, dir: string = pluginHome()): string {
  ensureHome(dir);
  const file = loadAllCredentials(dir);
  file.keys[credentialKey(creds.chainId, creds.address)] = creds;
  const path = credentialsPath(dir);
  writeJson(path, file);
  return path;
}

export function deleteCredentials(chainId: number, address: string, dir: string = pluginHome()): boolean {
  const file = loadAllCredentials(dir);
  const key = credentialKey(chainId, address);
  if (!file.keys[key]) return false;
  delete file.keys[key];
  writeJson(credentialsPath(dir), file);
  return true;
}

/** Environment override, then the file. `undefined` when the wallet has no key on this chain. */
export function loadCredentials(chainId: number, address: string, dir: string = pluginHome(), env: NodeJS.ProcessEnv = process.env): StoredCredentials | undefined {
  const envKey = env.PERPL_API_KEY?.trim();
  const envSecret = env.PERPL_API_KEY_SECRET?.trim();
  if (envKey && envSecret) {
    return {
      apiKey: envKey,
      seedHex: envSecret.startsWith("0x") ? envSecret : `0x${envSecret}`,
      chainId,
      address,
      publicKeyHex: "",
      label: "env",
      scopeMask: 0,
      createdAt: "",
      source: "env",
    };
  }
  return loadAllCredentials(dir).keys[credentialKey(chainId, address)];
}

export function requireCredentials(chainId: number, address: string, dir?: string): StoredCredentials {
  const creds = loadCredentials(chainId, address, dir);
  if (!creds) {
    throw new CommandError(
      "PERPL_NOT_ENROLLED",
      `No Perpl API key for ${address} on chain ${chainId}.`,
      "Run `mm perpl enroll --chain-id <id>` (your MetaMask wallet signs the enrollment once), or export PERPL_API_KEY and PERPL_API_KEY_SECRET.",
    );
  }
  return creds;
}
