import { CommandError } from "@metamask/agent-wallet/plugin";
import { type Address, getAddress, isAddress } from "viem";
import { DEFAULT_CHAIN_ID, NETWORKS } from "./perpl/config.js";

export function parseAddress(raw: string | undefined, what: string): Address {
  const value = (raw ?? "").trim();
  if (!isAddress(value)) {
    throw new CommandError("INVALID_EVM_ADDRESS", `${what} '${value}' is not a valid 0x address.`, "Pass a 40-hex-character 0x address.");
  }
  return getAddress(value);
}

/** Chain id flag → a chain Perpl runs on. Empty → PERPL_CHAIN_ID or 143 (Monad). */
export function parseChainId(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!text) return DEFAULT_CHAIN_ID;
  const n = Number.parseInt(text, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== text) {
    throw new CommandError("INVALID_CHAIN", `'${raw}' is not a valid chain id.`, "Use 143 (Monad) or 10143 (Monad Testnet).");
  }
  if (!NETWORKS[n]) {
    throw new CommandError("PERPL_UNSUPPORTED_CHAIN", `Perpl is not deployed on chain ${n}.`, `Use ${Object.keys(NETWORKS).join(" or ")}.`);
  }
  return n;
}

/** Minimal view of the host's wallet snapshot the plugin relies on. */
export type WalletLike = { address: string; name?: string; id?: string; walletId?: string | null };
export type WalletRefLike = { address?: string; id?: string; name?: string };
export type WalletStateLike = {
  byokWallets: WalletLike[];
  remoteWallets: WalletLike[];
  selectedWallet?: { ref: WalletRefLike } | null;
};

/** The wallet `mm` will sign with: the selected one when the snapshot records it, else the first known wallet. */
export function pickActiveWallet(state: WalletStateLike): WalletLike | undefined {
  const wallets = [...state.byokWallets, ...state.remoteWallets];
  const ref = state.selectedWallet?.ref;
  if (ref) {
    const match = wallets.find(
      (w) =>
        (ref.address !== undefined && w.address.toLowerCase() === ref.address.toLowerCase()) ||
        (ref.id !== undefined && (w.id === ref.id || w.walletId === ref.id)) ||
        (ref.name !== undefined && w.name === ref.name),
    );
    if (match) return match;
  }
  return wallets[0];
}

export function resolveOwner(ctx: { walletStateManager: { read(): WalletStateLike } }, explicit?: string): Address {
  if (explicit && explicit.trim()) return parseAddress(explicit, "address");
  const active = pickActiveWallet(ctx.walletStateManager.read());
  if (!active?.address) {
    throw new CommandError("WALLET_NOT_FOUND", "No active MetaMask wallet found.", "Run `mm init` / `mm wallet create`, or pass --address.");
  }
  return parseAddress(active.address, "active wallet address");
}
