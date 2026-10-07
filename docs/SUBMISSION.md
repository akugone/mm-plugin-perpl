# Metropolis submission — mm-plugin-perpl

Texts pasted into hackathon.monad.xyz (Project → Submission). Keep in sync if edited there.

## Project name

mm-plugin-perpl: perps on Monad for the MetaMask Agent Wallet

## One-line description

A MetaMask Agent Wallet plugin that lets any AI agent trade perpetuals on Perpl (Monad) behind real guardrails: wallet-authorised trade-only key, caps, risk alerts, smart-money signals.

## Description

Plain text on purpose: the hackathon page renders neither markdown nor line breaks, so each paragraph opens with a
label in capitals.

WHAT IT IS — mm-plugin-perpl lets an AI agent trade on Perpl, the perpetual futures exchange on Monad, with a MetaMask wallet, under safety limits the agent cannot get around.

THE PROBLEM — AI agents can now have their own crypto wallet. MetaMask's Agent Wallet keeps the keys out of the agent's reach and checks every transaction before it leaves. But trading on an exchange doesn't go through the wallet: orders are sent with a separate exchange key. The wallet's protection stops at the exchange's door, so nothing stops an agent that misreads a size or keeps re-sending an order.

WHAT WE BUILT —
1. A plugin for the MetaMask Agent Wallet. The wallet itself opens the trading account and approves a special key that can place trades but can never withdraw money.
2. A guard on every order: a maximum per trade and per day, a leverage limit, a list of allowed markets, and a "yes" from the human before anything is sent. An order that breaks a rule is refused before it reaches the exchange.
3. A live dashboard for the human: what the agent holds, its profit or loss, and how close each position is to being liquidated, with alerts.
4. Trade ideas from Nansen: what experienced "smart money" traders are buying or selling, turned into a suggestion that already respects the limits. The agent never trades on its own.

HOW IT FEELS — You ask your agent (Hermes, Claude Code, Codex or Cursor): "open a 20 dollar long on Bitcoin". The agent checks the limits, shows you the exact order and waits for your yes. You follow everything on the dashboard.

PROOF — Live on Monad testnet. Account creation, deposits, orders, closing and risk checks all ran through a real MetaMask agent wallet. Open source, with 29 automated tests.

LINKS — Dashboard: https://perpl-agent-monitor.vercel.app — Code: https://github.com/akugone/mm-plugin-perpl

UNDER THE HOOD (for technical readers) — A TypeScript plugin for MetaMask's mm command line. Every transaction and signature goes through MetaMask's plugin wallet executor (policy, simulation, Blockaid, 2FA). Orders use Perpl's trading API with a trade-only key; the dashboard reads the Perpl contract directly; ideas come from Nansen's smart-money API.

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

https://perpl-agent-monitor.vercel.app/
