/** Shared "who am I, am I enrolled, open the trading socket" sequence used by every trading command. */
import { CommandError } from "@metamask/agent-wallet/plugin";
import type { Address } from "viem";
import { collateralToken, fetchContext } from "./perpl/rest.js";
import { requireCredentials, type StoredCredentials } from "./perpl/store.js";
import type { Account, PerplContext, Token } from "./perpl/types.js";
import { TradingSession } from "./perpl/ws.js";
import { resolveOwner, type WalletStateLike } from "./wallet.js";

export type Connected = {
  chainId: number;
  owner: Address;
  creds: StoredCredentials;
  perpl: PerplContext;
  collateral: Token;
  session: TradingSession;
};

export async function connect(ctx: { walletStateManager: { read(): WalletStateLike } }, chainId: number, explicitAddress?: string): Promise<Connected> {
  const owner = resolveOwner(ctx, explicitAddress);
  const creds = requireCredentials(chainId, owner);
  const perpl = await fetchContext(chainId);
  const collateral = collateralToken(perpl);
  const session = await TradingSession.open(chainId, creds);
  return { chainId, owner, creds, perpl, collateral, session };
}

/** The account orders are placed from; throws with the exact next step when it is missing or not forwarding-enabled. */
export function requireTradingAccount(c: Connected, opts: { needForwarding?: boolean } = { needForwarding: true }): Account {
  const acc = c.session.account();
  if (!acc) {
    c.session.close();
    throw new CommandError("PERPL_NO_ACCOUNT", `Wallet ${c.owner} has no Perpl exchange account on chain ${c.chainId}.`, "Run `mm perpl setup --chain-id <id> --deposit <AUSD>` to create one (goes through your MetaMask wallet).");
  }
  if (acc.fr) {
    c.session.close();
    throw new CommandError("PERPL_ACCOUNT_FROZEN", `Perpl account ${acc.id} is frozen.`, "Contact Perpl support (https://discord.gg/perpl).");
  }
  if (opts.needForwarding && !acc.fw) {
    c.session.close();
    throw new CommandError("PERPL_FORWARDING_DISABLED", `Perpl account ${acc.id} has order forwarding (one-click trading) disabled; API orders would be rejected.`, "Run `mm perpl setup --enable-forwarding-only --chain-id <id>` — one transaction signed by your MetaMask wallet.");
  }
  return acc;
}
