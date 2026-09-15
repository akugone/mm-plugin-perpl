# Project status — mm-plugin-perpl

Last updated: 2026-09-15 (day 1). Hackathon: Monad **Metropolis**, build window 1 Sep → 13 Oct 2026,
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

## Blocking right now

1. **Perpl requires a profile before an API key can be enrolled.** `/v1/api-key/enroll` → 404 "Target profile
   not found" for a wallet with no exchange account (reproduced: fresh wallet → 404; wallet with an account →
   200). The profile is created by the on-chain `createAccount` — so **`mm perpl setup` must run before
   `mm perpl enroll`** (docs/skill/status already reordered).
2. **`setup` needs funds on the server wallet on Monad Testnet**: ≥ 100 testnet AUSD (Perpl minimum to open an
   account) + a little MON for gas. Both balances are 0 today. The testnet AUSD contract
   (`0xa9012a055bd4e0edff8ce09f960291c09d5322dc`, AgoraDollar proxy) has **no public mint** (verified). The
   MetaMask Agent Wallet is a server wallet and cannot connect to the Perpl dapp, so the practical route is:
   connect a browser MetaMask to https://testnet.perpl.xyz, obtain testnet AUSD there, transfer AUSD + MON
   (faucet.monad.xyz or the hackathon dashboard faucet) to the server wallet address.

## Not yet exercised live (in order)

1. `mm perpl setup --chain-id 10143 --deposit 100` — approve, `createAccount`, `allowOrderForwarding` through the
   wallet executor. Unknowns: Perpl's `createAccount(uint256)` ABI is from the docs (not verified against the
   deployed contract); MetaMask fee estimation on Monad testnet (Sepolia had `rpc_fee_too_low`; `setup` has no
   gas flags yet — add `--gas-speed` / explicit fees like `mm-plugin-allowances revoke` if it bites).
2. `mm perpl enroll --chain-id 10143` — should now pass once the profile exists.
3. `mm perpl status`, `positions`, `risk` — first real WebSocket session with a key: check the snapshot parsing
   (`as[]`, `fw`, `lfr`), `PositionsSnapshot` shape (`d[]` assumed), heartbeat `h`.
4. `mm perpl order --market BTC --side long --notional-usd 20 --leverage 2 --dry-run` then with `--yes` — first
   real order: verify `mt 3` `cid` echo, `mt 24` matching by `rq`, fill parsing, ledger write.
5. `mm perpl close`.
6. `mm perpl signals` with `NANSEN_API_KEY` — verify the real response shapes of `/smart-money/netflow` and
   `/smart-money/perp-trades` (field names assumed from docs), credit costs in `X-Nansen-Credits-Cost`.
7. `mm perpl risk` from a Hermes cron → Telegram (the Perpl "risk tool" story).
8. Demo video (3 min) on Hermes + Kimi; Builder Hub / X posts; hackathon submission (opens 22 Sep) with the
   bounty fields filled.

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
