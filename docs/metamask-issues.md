# Draft issues for MetaMask (not posted yet)

Target: https://github.com/MetaMask/agent-wallet-plugin-template/issues (public; the CLI's own tracker,
MetaMask/agentic, is private).

---

## Issue 1 — Template's `minCliVersion: "^6.2.0"` makes plugins refuse to load on mm 7.0.0

**What happens**

`package.json` in this template declares:

```json
"mm": { "schemaVersion": 1, "minCliVersion": "^6.2.0", ... }
```

and `"@metamask/agent-wallet": "^6.2.0"` as peer and dev dependency.

`@metamask/agent-wallet` 7.0.0 (published 2026-09-16) checks the manifest with
`semver.satisfies(cliVersion, manifest.minCliVersion, { includePrerelease: true })`. `7.0.0` does not satisfy `^6.2.0`,
so every plugin generated from the template is rejected at load time with `PLUGIN_CLI_VERSION`
("Package '…' requires CLI ^6.2.0; running 7.0.0").

7.0.0's changelog lists the licence change as its only breaking change; the plugin SDK surface the template uses
(`PluginCommand`, `schemaToFlags`, `ctx.walletExecutor`, `ctx.publicClient`) is unchanged, and a plugin built against
6.2.1 runs fine on 7.0.0 once the range is widened.

**Suggested fix**

Use a range that admits the next major once it's verified, for example `">=6.2.0 <8"` (or `"^6.2.0 || ^7.0.0"`), for
`minCliVersion` and the peer dependency, and mention in the README that `minCliVersion` is a semver range checked
with `satisfies`, so a caret range excludes the next major.

**Context**

Found while building [mm-plugin-perpl](https://github.com/akugone/mm-plugin-perpl) (perps on Perpl, Monad) for the
Monad Metropolis hackathon; fixed there in commit `bedd699`.

---

## Issue 2 — mm 7: wallet transactions on Monad Testnet (10143) fail with "Invalid chainId"

**What happens**

Monad Testnet is in the network registry (`guardSupported: true`) and can be allowed in the wallet policy (an EIP-712
signature on 10143 went through with mm 6.2). But on mm 7.0.0 any **transaction** a plugin submits on 10143 through
`ctx.walletExecutor` fails before signing:

```
Error: Gas fee/price estimation failed. Message: Non-200 status code: '400'
  … TransactionController.getGasFeesForSpeed …
  data: { error: 'Invalid chainId' }   (code -32603)
```

`mm wallet balance --testnet-chain-ids 10143` fails the same way ("No configured chain for testnet chain id 10143").
Chains without an `rpcTarget` are served through `agentic-proxy.workers.cx.metamask.io/infura-service/v1`, which
answers `Invalid chainId` for 10143; the gas API (`gas.api.cx.metamask.io/networks/10143/…`) also returns 400.

**Workaround that works**

Add the chain with a public RPC to the wallet state (`~/.metamask/wallets.json`, `data.customEvmChains`):

```json
{ "key": "monad-testnet", "chainId": 10143, "caip2": "eip155:10143", "name": "Monad Testnet",
  "nativeCurrency": { "name": "Monad", "symbol": "MON", "decimals": 18 },
  "blockExplorer": "https://testnet.monadscan.com", "rpcTarget": "https://testnet-rpc.monad.xyz" }
```

With it, balances read correctly and transactions go through (approve, `createAccount`, `allowOrderForwarding` and
`depositCollateral` on Perpl's testnet exchange all confirmed from a server wallet in Guard mode).

**Suggestions**

1. Serve Monad Testnet from the proxy, or ship a default `rpcTarget` for registry testnets the proxy doesn't cover.
2. Offer a supported way to add a custom EVM chain (e.g. `mm chains add`), since editing `wallets.json` by hand is the
   only path today.
3. Surface the root cause: the current error reads like a gas-price problem.

**Context**

Found while building [mm-plugin-perpl](https://github.com/akugone/mm-plugin-perpl) for the Monad Metropolis hackathon.
The plugin maps this failure to `MM_CHAIN_RPC_UNAVAILABLE` with the workaround as its hint.
