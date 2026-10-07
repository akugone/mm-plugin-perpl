# Metropolis submission — mm-plugin-perpl

Texts pasted into hackathon.monad.xyz (Project → Submission). Keep in sync if edited there.

## Project name

mm-plugin-perpl: perps on Monad for the MetaMask Agent Wallet

## One-line description

A MetaMask Agent Wallet plugin that lets any AI agent trade perpetuals on Perpl (Monad) behind real guardrails: wallet-authorised trade-only key, caps, risk alerts, smart-money signals.

## Description

AI agents are getting wallets. MetaMask shipped the Agent Wallet CLI (`mm`) in August 2026: keys stay in MetaMask (server-wallet TEE or BYOK), and every transaction goes through MetaMask's policy, simulation, Blockaid scan and 2FA. What agents still cannot do safely is trade. Perps are where traders live, and on Monad that is Perpl.

mm-plugin-perpl adds a `mm perpl` command family to the MetaMask Agent Wallet CLI. Any agent that drives `mm` (Hermes, Claude Code, Codex, Cursor) can now open, monitor and close perpetual positions on Perpl, Monad's on-chain perps DEX, from a conversation.

**How it works**

- `mm perpl setup` creates the Perpl exchange account and enables one-click trading: approve AUSD, `createAccount`, `allowOrderForwarding`. All three are wallet transactions sent through the plugin SDK's `walletExecutor`, so MetaMask's policy, simulation, Blockaid and 2FA apply. `mm perpl deposit` tops up collateral the same way.
- `mm perpl enroll` generates an Ed25519 API key locally. The MetaMask wallet signs Perpl's EIP-712 authorisation, again through the executor. The key is trade-only (Perpl API keys can never withdraw), time-limited, revocable, and stored 0600.
- `mm perpl order` / `close` place and close orders over Perpl's trading WebSocket. The exchange forwards them on-chain and pays the gas, which is what makes agent trading practical.

**The problem we solve: the guard MetaMask cannot see**

Because Perpl orders go through an API key and not through the wallet, MetaMask's Guard Mode never sees them. The plugin closes that gap with its own guard, shaped like Guard Mode: per-order notional cap, max leverage, a rolling 24 h notional cap (mirrors MetaMask's outflow limit), max open positions, allowed markets (mirrors allowlists), and human confirmation by default. `GUARD_BLOCKED` is returned before anything reaches Perpl. Raising a limit is a deliberate command, never a retry, and the bundled agent skill tells the agent exactly that.

**Beyond placing orders**

- `mm perpl positions` and `mm perpl risk`: PnL, margin ratio and estimated liquidation price and distance. `risk --json` returns `ok:false` plus `alerts[]` when a threshold is crossed, so a cron job or an agent can relay it to Telegram.
- `mm perpl signals`: Nansen smart-money netflow on Monad plus smart-money perp positioning, turned into a bias, a score, human-checkable evidence and a suggested order already sized by the guard. It never places an order itself.
- `mm perpl status` always answers with the exact next step, so an agent can onboard a user end to end.
- **Perpl Agent Monitor** (https://akugone.github.io/mm-plugin-perpl/): the human's view while the agent trades. Live equity, positions, PnL, estimated liquidation and alerts, plus the account's activity feed, read straight from the Perpl contract with no API key and no backend.

**Built for agents**

All inputs are named flags. Every command supports `--json`, and errors come back as `{code, message, hint}` where the hint names the next command to run. `--dry-run` shows the exact order frame without sending anything. A skill (`skills/perpl-trading/SKILL.md`) teaches any agent the safe flow: confirm the exact order with the user before `--yes`, and never raise a cap on its own.

**Stack**

TypeScript, oclif, the MetaMask Agent Wallet plugin SDK (mm 6.2 and 7.x), viem, Ed25519 via `node:crypto` (no extra crypto dependency), Perpl REST and trading WebSocket, Nansen API. 25 unit tests (request signing, Ed25519, order frames, guard and ledger, signals, risk), CI on GitHub Actions. Exchange ABI checked against the implementation deployed on Monad Testnet.

## Go-to-market and user acquisition

Who: developers and power users who already run an AI agent (Hermes, Claude Code, Cursor, Codex) and want it to trade, not just hold. MetaMask Agent Wallet is the trusted custody layer they are adopting. Perpl is the venue on Monad.

1. **Ride MetaMask's plugin ecosystem from day one.** The `mm` plugin system launched in September 2026 and its examples repo is nearly empty. A clean, useful trading plugin gets noticed by the MetaMask team and its users. We publish it on npm (`mm plugins install mm-plugin-perpl`) and open a PR to MetaMask/agent-skills to list the skill.
2. **Agent distribution.** The same author maintains the MetaMask plugin for Hermes Agent, already accepted in Nous Research's official plugin catalog. Hermes users get Perpl trading from Telegram or Discord with Hermes' human-approval buttons on top of the plugin's guard. The bundled SKILL.md makes it work in Claude Code, Cursor and Codex with no extra integration.
3. **Volume for Perpl.** Every agent user is a new Perpl account, one deposit, and recurring order flow forwarded by the exchange. We work with Perpl on a builder or referral code and co-announce on X and in their Discord.
4. **Content that converts.** A 2-minute "my agent trades perps on Monad, and here is why it cannot blow up my account" video, a write-up on the API-key guard gap, and recipes (risk alerts to Telegram, guard-capped signal trading).
5. **Trust as the wedge.** Agent trading's main objection is risk. Every recipe ships with conservative defaults ($100 per order, 3x, $300 per 24 h, confirmation on), keys that cannot withdraw, and fail-closed behaviour.

Metrics we track: plugin installs (npm), enrolled keys, Perpl accounts created through the plugin, and the guard's block rate (proof the safety net is used).

## MetaMask bounty — trader-focused capabilities

The plugin gives a MetaMask Agent Wallet a complete perps trading loop on Monad, through the wallet and never around it.

- **Onboard (wallet transactions).** `mm perpl setup` approves AUSD, calls `createAccount` and enables order forwarding on Perpl. `mm perpl deposit` tops up collateral. Each is a transaction submitted with `ctx.walletExecutor`, so MetaMask's policy, simulation, Blockaid and 2FA apply. The plugin never sees a private key.
- **Authorise trading (wallet signature).** `mm perpl enroll` has the MetaMask wallet sign Perpl's EIP-712 API-key authorisation through the executor. The resulting key is trade-only and cannot withdraw (a Perpl rule), with a 30-day default lifetime, and it is revocable.
- **Trade.** `mm perpl order` opens market or limit positions by size or by USD notional, with leverage, slippage, post-only and `--dry-run`. `mm perpl close` closes fully or partially at market.
- **Guardrails a trader actually needs.** Per-order notional, max leverage, rolling 24 h notional, max open positions, allowed markets, confirmation. They are modelled on MetaMask Guard Mode and checked before anything is sent, because API-key orders bypass Guard Mode by design.
- **Monitor.** `mm perpl positions` shows PnL, margin ratio and estimated liquidation. `mm perpl risk --json` is cron-ready and reports `ok:false` plus alerts.
- **Decide.** `mm perpl signals` turns Nansen smart-money flows into a bias with evidence and a guard-sized suggestion.
- **Markets.** `mm perpl markets` shows mark price, funding, open interest and fees for every Perpl market.

Minimal capabilities by design: only `setup`, `deposit` and `enroll` request `wallet-submit`, trading commands request `wallet-read` only, and `markets`, `guard` and `signals` request none.

## SKILL.md

https://github.com/akugone/mm-plugin-perpl/blob/main/skills/perpl-trading/SKILL.md

## Nansen bounty — integration

`mm perpl signals` turns two Nansen API endpoints into trade decisions for Perpl markets, inside the MetaMask Agent Wallet CLI that AI agents already drive.

Endpoints: POST /api/v1/smart-money/netflow (spot netflow of labelled smart wallets, one call across Monad, Ethereum, Base, Arbitrum and Solana) and POST /api/v1/smart-money/perp-trades (smart-money perp positioning, trailing window).

Beyond raw data:
- Per Perpl market, the plugin maps symbols to the tokens Nansen reports (BTC → WBTC/cbBTC, ETH → WETH/stETH, MON → WMON…).
- It keeps only opens and adds (reductions and closes say nothing about conviction), then weights direction by conviction: full weight at $100k opened across 3 trades, so a lone $98 open can't produce a trade idea.
- Output per market: bias (long/short/neutral), a score from −1 to +1, a confidence level, human-checkable evidence lines ("+$538.6k long vs +$4.9k short across 4 trades"), and a suggested order already sized by the user's guardrails (max notional, max leverage).
- It never places an order: the agent shows the idea, the user decides, and `mm perpl order` re-checks every limit and asks for confirmation.

Agent-native: JSON output, a bundled SKILL.md telling agents how to present signals, and credit accounting from Nansen's X-Nansen-Credits-Cost header (10 credits per run, `--skip-perps` halves it).

Verified live on 2026-10-07 against the Nansen API (first run caught a field mismatch, `side` vs `position_side`, now fixed and covered by tests). Note: smart-money netflow currently returns no rows for Monad itself, which is why netflow also scans the chains where the same assets trade.

## Perpl API bounty — link

https://github.com/akugone/mm-plugin-perpl

## Perpl Analytics / Risk Tool bounty — dashboard link

https://akugone.github.io/mm-plugin-perpl/
