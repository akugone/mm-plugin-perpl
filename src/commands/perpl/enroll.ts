import { type CommandIO, CommandError, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { hashTypedData } from "viem";
import { type Executor, signTypedData } from "../../lib/executor.js";
import { intFlag } from "../../lib/inputs.js";
import { ENROLL_ORIGIN, network } from "../../lib/perpl/config.js";
import { bytesToHex, generateKeyPair, hexToBytes, sign } from "../../lib/perpl/ed25519.js";
import { credentialsPath, deleteCredentials, loadCredentials, saveCredentials } from "../../lib/perpl/store.js";
import { parseChainId, resolveOwner } from "../../lib/wallet.js";

const inputs = {
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id: 143 (Monad) or 10143 (Monad Testnet)", required: false, prompt: false },
  label: { type: InputFieldType.Text, flag: "label", message: "Label shown in Perpl's API-keys page (default mm-plugin-perpl)", required: false, prompt: false },
  expiresDays: { type: InputFieldType.Text, flag: "expires-days", message: "Key lifetime in days (default 30; 0 = never expires)", required: false, prompt: false },
  force: { type: InputFieldType.Boolean, flag: "force", message: "Replace an existing key for this wallet/chain", required: false, prompt: false, default: false },
  forget: { type: InputFieldType.Boolean, flag: "forget", message: "Delete the locally stored key for this wallet/chain and exit (revoke it in Perpl's web UI too)", required: false, prompt: false, default: false },
} satisfies InputSchema;

type PayloadResponse = { typed_data: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType?: string; message: Record<string, unknown> }; mac: string };
type EnrollResponse = { api_key: { api_key: string; address: string; scope_mask: number; label: string; expires_at: number; created_at: number } };

export type EnrollResult = {
  chainId: number;
  network: string;
  wallet: string;
  label: string;
  scope: "trade (implies read; withdrawals impossible via API keys)";
  publicKey: string;
  expiresAt?: string;
  storedAt: string;
  walletSignatureStatus?: string;
  forgotten?: boolean;
};

const SCOPE_TRADE = 2; // 1 = read, 2 = trade (implies read). Withdrawals are never possible with an API key.

export default class PerplEnroll extends PluginCommand<EnrollResult> {
  static override description =
    "Enroll a trade-scoped Perpl API key for the active MetaMask wallet. Generates an Ed25519 key locally, asks the wallet to sign Perpl's EIP-712 enrollment (MetaMask policy + 2FA apply), and stores the key at 0600. The key can trade but can never withdraw.";
  static override examples = [
    "<%= config.bin %> perpl enroll --chain-id 10143",
    "<%= config.bin %> perpl enroll --chain-id 143 --label 'hermes bot' --expires-days 7",
    "<%= config.bin %> perpl enroll --chain-id 143 --forget",
  ];
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "perpl:enroll";

  async execute(io: CommandIO): Promise<EnrollResult> {
    const r = await io.resolveInputs(inputs);
    const chainId = parseChainId(r.chainId);
    const net = network(chainId);
    const owner = resolveOwner(this.ctx);
    const label = (r.label ?? "").trim() || "mm-plugin-perpl";
    const expiresDays = intFlag(r.expiresDays, "expires-days", { min: 0, max: 365 }) ?? 30;

    if (r.forget) {
      const removed = deleteCredentials(chainId, owner);
      if (!removed) throw new CommandError("PERPL_NOT_ENROLLED", `No stored key for ${owner} on chain ${chainId}.`, "Nothing to forget.");
      return { chainId, network: net.name, wallet: owner, label, scope: "trade (implies read; withdrawals impossible via API keys)", publicKey: "", storedAt: credentialsPath(), forgotten: true };
    }

    const existing = loadCredentials(chainId, owner);
    if (existing && existing.source === "enroll" && !r.force) {
      throw new CommandError("PERPL_ALREADY_ENROLLED", `${owner} already has a Perpl key on chain ${chainId} (label '${existing.label}').`, "Pass --force to enroll a new one (revoke the old key at " + net.appUrl + "/apikeys).");
    }

    // 1. Fresh Ed25519 key pair; the seed never leaves this machine.
    const kp = generateKeyPair();

    // 2. Ask Perpl for the EIP-712 enrollment payload bound to this wallet + public key + scope.
    io.progress("Requesting enrollment payload from Perpl");
    const payloadRes = await fetch(`${net.api}/v1/api-key/payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ENROLL_ORIGIN },
      body: JSON.stringify({
        chain_id: chainId,
        address: owner,
        public_key: kp.publicKeyHex,
        scope_mask: SCOPE_TRADE,
        label,
        ...(expiresDays > 0 ? { expires_at: Date.now() + expiresDays * 86_400_000 } : {}),
      }),
    });
    io.progress(undefined);
    if (!payloadRes.ok) {
      const text = await payloadRes.text().catch(() => "");
      throw new CommandError("PERPL_PAYLOAD_FAILED", `Perpl refused the enrollment payload (HTTP ${payloadRes.status}). ${text.slice(0, 200)}`, "If the error mentions Origin, set PERPL_ORIGIN to an origin Perpl has whitelisted for you.");
    }
    const { typed_data, mac } = (await payloadRes.json()) as PayloadResponse;
    if (!typed_data?.domain || !typed_data?.types || !typed_data?.message || !mac) {
      throw new CommandError("PERPL_PAYLOAD_INVALID", "Perpl returned an incomplete enrollment payload.", "Try again; if it persists the API changed.");
    }
    const primaryType = typed_data.primaryType ?? inferPrimaryType(typed_data.types);
    const typedData = { ...typed_data, primaryType };

    // 3. The MetaMask wallet signs the EIP-712 payload — through MetaMask's own pipeline (policy, 2FA).
    const executor = (await this.ctx.walletExecutor(io, this.pluginCommandId)) as Executor;
    const summary = `Authorize a trade-only Perpl API key '${label}' for ${owner} on ${net.name}${expiresDays > 0 ? ` (expires in ${expiresDays}d)` : ""}`;
    const signed = await signTypedData(executor, chainId, typedData, { action: "custom", summary, details: { publicKey: kp.publicKeyHex, scope: "trade", label, origin: ENROLL_ORIGIN } });
    if (!signed.signature) {
      throw new CommandError("PERPL_WALLET_SIGNATURE_MISSING", `The wallet did not return a signature (status ${signed.status ?? "unknown"}${signed.failure ? `: ${signed.failure}` : ""}).`, signed.pollingId ? `Approve the request in MetaMask (2FA), then run enroll again. Track: mm wallet requests watch ${signed.pollingId}` : "Approve the signature in MetaMask and retry.");
    }

    // 4. Proof of possession: Ed25519 signature over the same EIP-712 digest.
    // viem's generics need concrete literal types; the payload is server-defined, so cast the whole call once.
    const digest = (hashTypedData as unknown as (args: unknown) => `0x${string}`)({ domain: typedData.domain, types: typedData.types, primaryType, message: typedData.message });
    const pop = sign(kp.seedHex, hexToBytes(digest));

    // 5. Enroll.
    io.progress("Enrolling key with Perpl");
    const enrollRes = await fetch(`${net.api}/v1/api-key/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ENROLL_ORIGIN },
      body: JSON.stringify({ chain_id: chainId, address: owner, typed_data, mac, signature: signed.signature, pop_signature: bytesToHex(pop) }),
    });
    io.progress(undefined);
    if (!enrollRes.ok) {
      const text = await enrollRes.text().catch(() => "");
      throw new CommandError("PERPL_ENROLL_FAILED", `Perpl refused the enrollment (HTTP ${enrollRes.status}). ${text.slice(0, 200)}`, "The wallet signature or proof-of-possession was not accepted. Retry once; then check https://docs.perpl.xyz.");
    }
    const enrolled = (await enrollRes.json()) as EnrollResponse;
    const token = enrolled?.api_key?.api_key;
    if (!token) throw new CommandError("PERPL_ENROLL_INVALID", "Perpl did not return an API key token.", "Retry the enrollment.");

    const storedAt = saveCredentials({
      apiKey: token,
      seedHex: kp.seedHex,
      publicKeyHex: kp.publicKeyHex,
      chainId,
      address: owner,
      label,
      scopeMask: enrolled.api_key.scope_mask ?? SCOPE_TRADE,
      createdAt: new Date().toISOString(),
      expiresAt: enrolled.api_key.expires_at || undefined,
      source: "enroll",
    });

    return {
      chainId,
      network: net.name,
      wallet: owner,
      label,
      scope: "trade (implies read; withdrawals impossible via API keys)",
      publicKey: kp.publicKeyHex,
      expiresAt: enrolled.api_key.expires_at ? new Date(enrolled.api_key.expires_at).toISOString() : undefined,
      storedAt,
      walletSignatureStatus: signed.status,
    };
  }

  override successHint(data: EnrollResult): string {
    if (data.forgotten) return `Local Perpl key for ${data.wallet} on chain ${data.chainId} deleted. Revoke it in Perpl's web UI as well.`;
    return `Perpl API key '${data.label}' enrolled for ${data.wallet} on ${data.network}${data.expiresAt ? `, expires ${data.expiresAt}` : ""}. Stored at ${data.storedAt}. Next: mm perpl status.`;
  }
}

/** EIP-712 primary type = the struct no other struct references (excluding EIP712Domain). */
export function inferPrimaryType(types: Record<string, unknown>): string {
  const names = Object.keys(types).filter((t) => t !== "EIP712Domain");
  const referenced = new Set<string>();
  for (const n of names) {
    for (const f of (types[n] as { type?: string }[] | undefined) ?? []) {
      const base = String(f.type ?? "").replace(/\[.*\]$/, "");
      if (names.includes(base)) referenced.add(base);
    }
  }
  const roots = names.filter((n) => !referenced.has(n));
  if (roots.length !== 1) throw new CommandError("PERPL_PAYLOAD_INVALID", "Could not determine the EIP-712 primary type of Perpl's payload.", "Retry; if it persists the API changed.");
  return roots[0];
}
