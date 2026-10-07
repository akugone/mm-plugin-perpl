# mm-plugin-perpl — perps on Monad for the MetaMask Agent Wallet

A plugin for the [MetaMask Agent Wallet CLI](https://docs.metamask.io/agent-wallet/) (`mm`) that gives an AI agent's
wallet a new trading superpower: **perpetual futures on [Perpl](https://perpl.xyz), Monad's on-chain perps DEX** —
with the guardrails an agent needs to be trusted with it.

```
mm perpl status      where you stand, and the exact next step
mm perpl setup       create the Perpl account + enable one-click trading   (wallet transactions → MetaMask policy + 2FA)
mm perpl deposit     add AUSD collateral to an existing account               (wallet transactions → MetaMask policy + 2FA)
mm perpl enroll      trade-only API key, authorised by the wallet's EIP-712 signature  (→ MetaMask policy + 2FA)
mm perpl guard       the plugin's own caps: notional, leverage, rolling 24h, open positions, markets, confirmation
mm perpl markets     Perpl markets: mark, funding, fees                        (public)
mm perpl signals     Nansen smart-money → bias + evidence + a guard-sized suggestion
mm perpl order       open a position, checked against the guard, confirmed, then forwarded
mm perpl positions   size, entry vs mark, PnL, margin ratio, estimated liquidation
mm perpl risk        cron-friendly risk check: ok:false + alerts when a threshold is crossed
mm perpl close       close a position at market
```

Works with any agent that drives the `mm` CLI — Hermes, Claude Code, Codex, Cursor. A skill for agents is bundled
in `skills/perpl-trading/SKILL.md`.

> **Status (2026-10-07): full loop verified live on Perpl Monad Testnet through `mm` 7.0.0** with a MetaMask server
> wallet: `setup` (3 wallet transactions: [approve](https://testnet.monadscan.com/tx/0x6418365925138157a61e5c3d1cd0967af5b91d07f657ce5fdfe68ec02dd93343),
> [createAccount](https://testnet.monadscan.com/tx/0x00c678157d9bbb9d274a28befe0397502dd5c3bc1987b8d652ab37d0a4a0b574),
> [allowOrderForwarding](https://testnet.monadscan.com/tx/0x1395a721402fcd38d38d4719ca65f8e1d3c9692336d3a3c6b5db2d4d862c7b29)),
> `enroll` (wallet-signed EIP-712), `status`, a filled market `order`, `positions`, `risk`, and a filled `close`.
> `deposit` and `signals` (against the live Nansen API) verified live too. Details: **[STATUS.md](STATUS.md)**.

## Why this shape

Perpl's API places orders through **Ed25519 API keys**, not through the wallet: the exchange forwards the order and
pays the gas. That is what makes agent trading practical, and it is also why MetaMask's Guard Mode (allowlists,
outflow limit, Blockaid) **does not see orders**. So this plugin draws the line explicitly:

| Step | Who signs | Who protects |
|---|---|---|
| Deposit / create account / enable forwarding | Your MetaMask wallet (`mm wallet`) | MetaMask policy, simulation, Blockaid, 2FA |
| Authorise the API key (EIP-712) | Your MetaMask wallet | MetaMask policy, 2FA — the wallet prompt spells out "trade-only key" |
| Place / close orders | The enrolled API key (trade scope only) | **This plugin's guard**: per-order notional, leverage, rolling 24h notional, open positions, allowed markets, confirmation |
| Withdraw | Impossible with an API key (Perpl rule) | — |

The guard is deliberately shaped like MetaMask's Guard Mode: a rolling 24h cap mirrors the outflow limit, allowed
markets mirror allowlists, and every order is confirmed by a human unless you deliberately turn that off.

## Install

Plugins are a beta feature of `mm` (6.2.x and 7.x). Until the package is on npm, install from source:

```bash
git clone https://github.com/akugone/mm-plugin-perpl && cd mm-plugin-perpl
npm install && npm run build
# file: installs are symlinked into mm's data dir, so the plugin resolves imports from this folder. Point it at the
# host's copy of @metamask/agent-wallet, otherwise two copies of the SDK load and the consent hook fails with
# "window.addEventListener is not a function".
rm -rf node_modules/@metamask/agent-wallet
ln -s "$(npm root -g)/@metamask/agent-wallet" node_modules/@metamask/agent-wallet
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true      # dev-only flag; revert when done
mm plugins install "file:$PWD" --accept-permissions
mm perpl markets --chain-id 10143
```

> **If you already have another `file:` plugin installed** (e.g. `mm-plugin-allowances`): `@oclif/plugin-plugins`
> 5.5.2, bundled with mm 6.2.x, registers a directory install under the name of the *first* directory dependency it
> finds, so the second plugin is recorded under the first one's name and its commands never get their
> capabilities. Workaround until oclif fixes it: `mm plugins uninstall` the other plugins, install this one first,
> then reinstall the others (they are matched alphabetically, `mm-plugin-allowances` before `mm-plugin-perpl`).
> `mm plugins link` avoids the name bug but mm only grants capabilities to `type: user` plugins, so linked plugins
> can run `markets` / `guard` / `signals` and nothing that touches the wallet.

Requirements: Node.js ≥ 22.18 (global `fetch` and `WebSocket`; Ed25519 via `node:crypto` — no extra crypto
dependency), a MetaMask Agent Wallet signed in (`mm login`, `mm init`).

### Monad Testnet RPC (mm 7)

`mm` sends RPC for chains that have no `rpcTarget` through MetaMask's Infura proxy, which answers `Invalid chainId`
for Monad Testnet: gas estimation fails before anything is signed (the plugin reports `MM_CHAIN_RPC_UNAVAILABLE`).
Declare the chain once with its public RPC in mm's wallet state (`~/.metamask/wallets.json`, `data.customEvmChains`),
with no `mm` command running:

```json
{ "key": "monad-testnet", "chainId": 10143, "caip2": "eip155:10143", "name": "Monad Testnet",
  "nativeCurrency": { "name": "Monad", "symbol": "MON", "decimals": 18 },
  "blockExplorer": "https://testnet.monadscan.com", "rpcTarget": "https://testnet-rpc.monad.xyz" }
```

Check: `mm wallet balance --testnet-chain-ids 10143` lists your MON. Monad mainnet (143) is served by the proxy and
needs nothing.

## First run, step by step

Chain ids: **10143 = Monad Testnet**, **143 = Monad**. Start on testnet. Your MetaMask wallet policy must allow the
chain (`mm wallet policy get`; testnet is not in the default allowed set — add it once, one 2FA).

1. `mm perpl status --chain-id 10143` — tells you the next step every time.
2. `mm perpl setup --chain-id 10143 --deposit 100` — three wallet transactions, each through MetaMask's pipeline:
   approve AUSD to the exchange, `createAccount(amount)`, `allowOrderForwarding(true)` (Perpl's "one-click
   trading", required for API orders). This also creates your Perpl **profile**, which an API key attaches to —
   enrolling before the account exists fails with `PERPL_PROFILE_NOT_FOUND` (Perpl answers 404). The wallet needs
   AUSD for the deposit (≥ 100 on testnet) and a little MON for gas: testnet MON from the Monad faucet (faucet.monad.xyz). There is
   no testnet AUSD faucet: a Perpl testnet account opened from the web app is credited with testnet AUSD, which
   you can withdraw in the app and send to the agent wallet.
3. `mm perpl enroll --chain-id 10143` — generates an Ed25519 key locally, asks Perpl for the EIP-712 enrollment
   payload, **your MetaMask wallet signs it** (you may get a 2FA), proves possession of the key, stores it at
   `~/.config/mm-plugin-perpl/credentials.json` (0600). Scope: trade only. Default lifetime 30 days.
4. `mm perpl guard` — defaults: **$100 per order, 3x, $300 per rolling 24h, 3 open positions, all markets,
   confirmation required.** Raise them deliberately: `mm perpl guard --max-notional-usd 250 --max-leverage 5`.
5. `mm perpl signals` (needs `NANSEN_API_KEY`) — ideas with evidence, sized by the guard.
6. `mm perpl order --market BTC --side long --notional-usd 50 --leverage 2 --yes` — guard check → confirm →
   forwarded → status, fill price. `--dry-run` shows everything without sending.
7. `mm perpl risk --json` from a cron — `ok: false` + `alerts[]` when margin ratio, loss or liquidation distance
   cross your thresholds.

## Commands

| Command | Wallet capability | What it does |
|---|---|---|
| `perpl markets [--chain-id]` | none | Public market list: mark, bid/ask, 24h change, OI, funding, fees, decimals |
| `perpl status` | `wallet-read` | Enrolled? account? balance, forwarding flag, open positions, guard usage, `nextStep` |
| `perpl setup --deposit <AUSD> \| --enable-forwarding-only [--skip-approve] [--dry-run]` | `wallet-read`, `wallet-submit` | Approve + createAccount + allowOrderForwarding through the wallet executor |
| `perpl deposit --amount <AUSD> [--skip-approve] [--dry-run]` | `wallet-read`, `wallet-submit` | Approve + depositCollateral into an existing account |
| `perpl enroll [--label] [--expires-days] [--force] [--forget]` | `wallet-read`, `wallet-submit` | Trade-only API key; wallet signs EIP-712; Ed25519 proof of possession; stored 0600 |
| `perpl guard [--max-notional-usd] [--max-leverage] [--max-daily-notional-usd] [--max-open-positions] [--allow-markets] [--require-confirm] [--reset]` | none | Show / change guardrails |
| `perpl order --market --side --size\|--notional-usd [--leverage] [--price] [--post-only] [--slippage-bps] [--yes] [--dry-run]` | `wallet-read` | Guard-checked, confirmed, forwarded order |
| `perpl close --market [--size] [--yes] [--dry-run]` | `wallet-read` | Market close, full or partial |
| `perpl positions` | `wallet-read` | Open positions with PnL, margin ratio, estimated liquidation |
| `perpl risk [--min-margin-ratio] [--max-loss-pct] [--min-liq-distance-pct]` | `wallet-read` | Alerts for cron |
| `perpl signals [--markets] [--lookback-hours] [--skip-perps]` | none | Nansen smart-money → bias, score, evidence, suggestion |

All inputs are named flags (safer for agents than positionals). Every command supports `--json`; errors come back
as `{ok:false, error:{code, message, hint}}` with a hint that names the next command to run.

## The guard

```
$ mm perpl order --market BTC --side long --notional-usd 500 --leverage 10 --yes
✖ GUARD_BLOCKED  Order refused by the plugin guard: notional $500 exceeds max-notional-usd $100; leverage 10x exceeds max-leverage 3x.
  Reduce the order, or raise the limit deliberately with `mm perpl guard --max-notional-usd …` (that is a decision, not a retry).
```

- Checked **before** anything reaches Perpl; the ledger of accepted orders lives in `~/.config/mm-plugin-perpl/ledger.json`.
- `--dry-run` runs the full check and prints the exact order frame.
- Confirmation: interactive prompt in a TTY, `--yes` otherwise. An agent must get the user's yes on the exact
  order before adding `--yes` (see the bundled skill). `--require-confirm false` exists for deliberate unattended
  strategies with tight caps.
- Closing a position is never blocked by the notional caps (it reduces risk); it still asks for confirmation.

## Nansen signals

`mm perpl signals` combines two Smart Money feeds per Perpl market: **spot netflow** on Monad, Ethereum, Base,
Arbitrum and Solana in one call (are labelled smart wallets accumulating or distributing the asset? Nansen returns
no smart-money netflow for Monad itself today) and **smart-money perp trades**, opens and adds only (how are they
positioning on the same asset?). Output per market: `bias`, `score` (−1…+1), `confidence`, human-checkable `evidence`, and a
`suggestion` already capped by your guard. It never places an order.

Nansen bills per call: 5 credits per feed, so 10 per run. The free tier grants 10 credits a day. Set
`NANSEN_API_KEY`; `--skip-perps` halves the cost. The command
reports `creditsSpent` from Nansen's response headers.

## Dashboard: the human's view

**[perpl-agent-monitor.vercel.app](https://perpl-agent-monitor.vercel.app/)**: Perpl Agent Monitor, in a soft black-and-white UI (light and dark). The agent trades
through `mm perpl`; the human watches here, without a terminal. For any wallet (`?address=0x…`, Monad Testnet or
Monad): equity, free and posted collateral, open positions with PnL, margin ratio, maintenance margin, estimated
liquidation price and distance, alerts with the same thresholds as `mm perpl risk`, the account's activity
(account created, deposits, opens, closes, liquidations, with explorer links) and every market's mark, open interest,
funding and margin parameters. Refreshes every 5 s.

Everything is read from the Perpl Exchange contract through the public Monad RPC (`getAccountByAddr`, `getPosition`,
`getPerpetualInfoV2`, `getMarginFractions`, events): no API key, no backend, nothing stored. Perpl's events don't index
the account, and the public RPC caps `eth_getLogs` at 100 blocks, so the activity feed scans the last ~20 minutes
then stays live; `?from=<block>` scans further back (e.g. `?from=68939700` shows this wallet's first trade). Single
static file: `dashboard/index.html`, deployed on Vercel (`cd dashboard && vercel deploy --prod`).

## Risk monitoring from cron

```
*/10 * * * *  mm perpl risk --chain-id 143 --json >> ~/perpl-risk.ndjson
```

Or from an agent: run `mm perpl risk --json` every N minutes and relay `alerts` when `ok` is false. Metrics per
position: unrealized PnL, margin ratio `(collateral + uPnL) / notional`, estimated liquidation price and distance.
Estimates are first-order (mark price, published maintenance margin, no funding/fees) and labelled as such.

## Security model

- **Two kinds of keys, never mixed.** The wallet key stays in MetaMask (server-wallet TEE or BYOK); the plugin only
  ever asks it to sign through `ctx.walletExecutor`, so every wallet action goes through MetaMask's policy,
  simulation, Blockaid and 2FA. The Perpl API key is a separate Ed25519 seed generated locally, trade scope only,
  time-limited, revocable in Perpl's web UI (`/apikeys`), stored 0600 and never passed on argv.
- **Withdrawals are impossible via the API key** — a Perpl rule, not a plugin promise.
- **Guardrails before every order**, with the caps and confirmation described above.
- **Hostile-input hygiene.** Symbols and error texts from the exchange are used as data; every numeric input is
  validated against the market's decimals; nothing from the network is interpolated into shell commands.
- **Minimal capabilities.** Only `setup` and `enroll` request `wallet-submit`; trading commands only need
  `wallet-read` (to know which wallet's key to use); `markets`, `guard`, `signals` need nothing.

## Development

```bash
npm install
npm test            # vitest: request signing, ed25519, scaling, order frames, guard + ledger, signals, risk
npm run build       # tsc + oclif manifest
```

Layout: `src/lib/perpl/` (auth, ed25519, rest, ws session, orders, scale, store, types) · `src/lib/guard.ts` ·
`src/lib/nansen.ts` · `src/lib/positions.ts` · `src/commands/perpl/*` · `skills/perpl-trading/SKILL.md`.

Built for the Monad **Metropolis** hackathon (Sep–Oct 2026). Sibling projects by the same author:
[hermes-metamask-wallet](https://github.com/akugone/hermes-metamask-wallet) (Hermes Agent plugin for the mm CLI)
and [mm-plugin-allowances](https://github.com/akugone/mm-plugin-allowances) (audit / revoke ERC-20 allowances).

## License

MIT
