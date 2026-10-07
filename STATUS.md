# Project status — mm-plugin-perpl

Last updated: 2026-10-07. Hackathon: Monad **Metropolis**, build window 1 Sep → 13 Oct 2026,
submissions open 22 Sep, close **14 Oct 05:59 CEST**, judging 14–27 Oct, winners 3–4 Nov.
Project already registered on hackathon.monad.xyz (primary track **Onchain Finance & Trading**), repo field to
point here.

## Bounties targeted

| Bounty | Prize | What qualifies us | Status |
|---|---|---|---|
| MetaMask — Best Agent Wallet Plugin | $2,500 | This is an `mm` CLI plugin that adds a trading superpower (perps on Perpl) | code done, live path not yet exercised end to end |
| Perpl — Best use of Perpl's API | $5,000 | `enroll`/`order`/`close` over Perpl's REST + trading WebSocket, guard, `--dry-run`, cron | same |
| Perpl — Best Analytics / Risk Tool | $3,000 | `positions` + `risk` (margin ratio, loss %, estimated liquidation, cron alerts) | same |
| Nansen — Best use of Nansen | $5,000 | `signals`: smart-money netflow on Monad + smart-money perp trades → bias, evidence, guard-sized suggestion | code done, never run against the live API (needs `NANSEN_API_KEY`) |
| Kimi — Best Builds Powered by KIMI | $3,000 credits | Run the demo agent (Hermes) on Kimi; Hermes has the `kimi-coding` provider | not started (demo-time) |

Rejected on purpose: Envio, Kuru, Privy, Dynamic, Mera, Agora, Chainlink, Aurora, Cleanverse, Hunyuan, Qwen.

## Done

- Repo scaffolded from `mm-plugin-allowances` (TypeScript, oclif, vitest). 10 commands under `mm perpl`.
- Perpl REST request signing (Ed25519 via `node:crypto`), trading-WebSocket session (sign-in mt 29, wallet /
  orders / positions snapshots, `rq` seeding from `lfr`, order frame mt 22 → status mt 3 → update mt 24).
- Guard: per-order notional, leverage, rolling 24h notional ledger, max open positions, allowed markets,
  confirmation. Ledger + config + credentials under `~/.config/mm-plugin-perpl/` (0700 / 0600).
- Nansen signal engine (pure function, tested on fixtures), position view + risk assessment.
- Agent skill `skills/perpl-trading/SKILL.md`. README with the security model.
- 25 unit tests green; CI green.
- **Verified live through `mm`**: `perpl markets` (7 Perpl testnet markets), `perpl guard` (read/set/reset),
  `perpl status` and the `PERPL_NOT_ENROLLED` paths of `order` / `positions`.
- **Verified live, enrollment path**: `/v1/api-key/payload` accepted (no Origin header); the MetaMask server
  wallet signed the EIP-712 payload from inside the plugin via `ctx.walletExecutor` (65-byte EOA signature,
  recovers to the wallet, ~2 s, no MFA asked); the Ed25519 proof of possession + enroll call returned **200**
  for a wallet that already has a Perpl profile.
- MetaMask wallet policy of the test wallet `0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab` now allows chain 10143
  (Monad Testnet) — one 2FA, done 2026-09-15.

## Verified live on 2026-10-07 (Monad Testnet, mm 7.0.0, server wallet `0x62Fe…32Ab`)

- `setup --deposit 1000`: approve `0x6418…3343`, createAccount `0x00c6…b574`, allowOrderForwarding `0x1395…7b29`,
  all status 1. Exchange account **958** with 1000 AUSD. No MFA asked (testnet AUSD is unpriced, so the 24 h outflow
  limit does not trigger).
- `enroll`: EIP-712 signed by the server wallet through `ctx.walletExecutor`, key stored 0600, expires 2026-11-06.
- `status` / `positions` / `risk`: first real WebSocket session; snapshot parsing (`as[]`, `fw`, positions `d[]`)
  matches. Liquidation estimate was 55 783 for a 2x long at 83 734 (−33 %): too conservative, see finding 6.
- `order --market BTC --side long --notional-usd 20 --leverage 2`: interactive confirm → FILLED at 83 734.3
  (order 4518063112192), ledger written.
- `close --market BTC`: FILLED at 83 698.4. Balance after round trip 999.98 AUSD.
- `order` guard pre-flight: `GUARD_BLOCKED` and `--dry-run` now work before enrollment (public market data).

## Found on the way (fixed)

1. **mm 7 rejected the plugin**: `minCliVersion ^6.2.0` → `>=6.2.0 <8`. mm 7.0.0's only breaking change is its
   license; the plugin SDK surface is unchanged.
2. **mm 7 cannot reach Monad Testnet RPC**: chains without an `rpcTarget` go through MetaMask's Infura proxy, which
   answers `Invalid chainId` for 10143, so gas estimation fails before signing. Fix: a `customEvmChains` entry with
   `rpcTarget: https://testnet-rpc.monad.xyz` (README › Monad Testnet RPC). The plugin now maps the failure to
   `MM_CHAIN_RPC_UNAVAILABLE` with that hint. Worth reporting to MetaMask (the network registry lists 10143).
3. **Order status reasons**: only 5 of 70 codes were mapped (a fill showed `code 43`); now the full table from
   PerplFoundation/api-docs.
4. **No testnet AUSD faucet** (confirmed by Perpl on Discord). Route used: a Perpl testnet account opened from the
   web app is credited with testnet AUSD → withdraw in the app → transfer to the agent wallet.
5. **Nansen signals, run live**: perp-trades returns `side` (not `position_side`) and includes reduces/closes, so the
   first live run read $0 everywhere. Fixed: `side` with fallback, opens/adds only, and a conviction weight
   (full at $100k opened and 3 trades) so a single $98 open no longer yields a full-size suggestion. Smart-money
   netflow returns nothing for Monad (with or without label filters), so netflow now scans Monad + Ethereum, Base,
   Arbitrum, Solana in the same call. Cost: 5 credits per feed; free tier = 10 credits/day.
6. **Maintenance margin unit**: `maintenance_margin` is a leverage in hundredths (the contract's `maintMarginFracHdths`,
   MMR = notional / MMF): BTC 2500 = 25x = 4 %, as in Perpl's docs. The plugin read it as basis points (25 %), which
   made liquidation estimates far too conservative. Fixed, with a test pinned to the docs' table.

## Dashboard (2026-10-07)

`dashboard/index.html` → https://akugone.github.io/mm-plugin-perpl/ (GitHub Pages, workflow `pages.yml`). Verified on
account 958 (history: account created, deposit 1000, BTC long opened 83 734.3, closed 83 698.4) and on a third-party
testnet account with 3 open longs (BTC 14x, ETH 12x, SOL 5x): positions, PnL and 4 risk alerts render; liquidation
distances match Perpl's rules (BTC 14x with 4 % maintenance → ~3.3 %). Perpl's REST API sends no CORS headers, so
everything is on-chain.

## Still to run live

1. `mm perpl deposit --amount 100` (approve + `depositCollateral`, selector checked on the deployed implementation).
2. `mm perpl risk` from a Hermes cron → Telegram (the Perpl "risk tool" story).
3. Demo video (≤ 3 min), pitch (≤ 2 min), MetaMask bounty video (≤ 5 min, real flows); logo; submission (texts in
   `docs/SUBMISSION.md`, closes 14 Oct 05:59 CEST).

## Known gaps / ideas

- `positions`/`risk` liquidation figures are first-order estimates; `maintenance_margin` unit is not documented
  (interpreted as bps when ≤ 10 000). Re-check against the Perpl UI once a position exists.
- Nansen `perp-trades` covers Hyperliquid only (trailing 7 days); netflow/dex-trades cover Monad. The signal
  mixes both — say so in the demo.
- No `perpl deposit` for an existing account (only `createAccount`); add `deposit(uint256)` once the ABI is known.
- `enroll` regenerates a key on every attempt; a wallet-signature MFA pause (server wallet) would waste the
  attempt — acceptable for now, revisit if MetaMask starts asking 2FA on typed data.
- Two throwaway API keys were enrolled on the public test address `0x19E7…ff2A` (private key `0x11…11`) while
  debugging the 404; harmless, not stored anywhere.

## Local dev quirks (Martin's Mac)

- `mm` 6.2.0 global at `~/.local/lib/node_modules/@metamask/agent-wallet`; plugin registry at
  `~/.local/share/mm/package.json` (never hand-edit — use `mm plugins install/uninstall`).
- **oclif directory-install name bug**: with several `file:` plugins, `mm plugins install file:…` registers the
  new one under the first dependency's name. Working order: uninstall others → install `mm-plugin-perpl` →
  reinstall `mm-plugin-allowances` (alphabetical match then works). Both are currently registered correctly.
- `mm plugins link` avoids that bug but mm only grants wallet capabilities to `type: user` plugins.
- After any `npm install` in this folder, re-symlink `node_modules/@metamask/agent-wallet` to the global copy,
  otherwise "window.addEventListener is not a function" in the consent hook (two SDK copies).
- Plugin data: `~/.config/mm-plugin-perpl/{credentials,guard,ledger}.json`.

## Sibling projects (frozen for the hackathon)

- `akugone/hermes-metamask-wallet` — Hermes plugin over the mm CLI, in the official Hermes plugin catalog
  (`hermes plugins install metamask-wallet`, PR NousResearch/hermes-agent#110644 merged 2026-09-15).
- `akugone/mm-plugin-allowances` — audit / revoke ERC-20 allowances (mm plugin), v0.2.1, not on npm yet.
