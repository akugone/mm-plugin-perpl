# Metropolis submission — mm-plugin-perpl

Texts as entered on hackathon.monad.xyz (Project → Submission). Keep in sync if edited there.

Plain text on purpose: the hackathon page renders neither markdown nor line breaks, so every paragraph opens with a
label in capitals. Written for a non-technical reader first; technical detail sits in the last paragraph or in the
bounty answers.

## Project name

mm-plugin-perpl: perps on Monad for the MetaMask Agent Wallet

## Logo

assets/logo-mono.png (black and white, matches the dashboard). Colour version: assets/logo.png.

## One-line description

Let your AI agent trade perps on Monad with a MetaMask wallet, under limits it can't get around, while you watch the risk live.

## Description

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

WHO IT'S FOR — People who already run an AI agent (Hermes, Claude Code, Cursor, Codex) and want it to trade, not just hold. They already trust MetaMask with their keys, and Perpl is where perps trade on Monad.

HOW WE REACH THEM —
1. MetaMask's plugin ecosystem, from day one. Plugins for the Agent Wallet opened in September 2026 and almost none exist yet, so a useful trading plugin stands out. We publish it on npm (one command to install) and ask MetaMask to list the trading skill in its official agent-skills repository.
2. The agents people already use. I maintain the MetaMask plugin for Hermes Agent, already in Nous Research's official catalog, so Hermes users can trade on Perpl from Telegram or Discord. The bundled skill file makes it work in Claude Code, Cursor and Codex with no extra setup.
3. Perpl itself. Every user opens a Perpl account and brings recurring order flow. We want to work with Perpl on a builder code and announce together on X and in their Discord.
4. Content that tells the safety story: a short video, "my agent trades perps, and here is why it can't blow up my account", and ready-made recipes such as risk alerts on Telegram or idea → confirm → trade.

WHY THEY WILL TRUST IT — Safe defaults out of the box: 100 dollars per trade, 3x leverage, 300 dollars per day, a human yes on every order, and a key that can never withdraw.

WHAT WE MEASURE — Installs, accounts opened through the plugin, orders placed, and how often the guard says no (proof that the safety net is used).

## Live product

https://testnet.monadscan.com/address/0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab

## Judge access instructions

LOOK FIRST — The live dashboard, https://perpl-agent-monitor.vercel.app, shows the agent wallet's Perpl account on Monad testnet: balance, positions, risk and activity.

ON-CHAIN PROOF — The agent wallet's own transactions (account creation, deposits): https://testnet.monadscan.com/address/0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab

TRY IT YOURSELF (about 10 minutes, Node 22.18 or later) —
1. npm i -g @metamask/agent-wallet, then mm login and mm init.
2. git clone https://github.com/akugone/mm-plugin-perpl, then npm install and npm run build, and follow the README's Install section.
3. Without funds: mm perpl markets --chain-id 10143, then mm perpl order --chain-id 10143 --market BTC --side long --notional-usd 500 --leverage 10 --dry-run (the guard refuses it), and the same with --notional-usd 50 --leverage 2 (accepted).
4. Full loop: fund the wallet with testnet MON and at least 100 testnet AUSD, add Monad testnet's public RPC (README, "Monad Testnet RPC", needed with mm 7), then setup, enroll, order, positions and risk, close.

There is no login to share: it is a command-line plugin. Status and evidence: STATUS.md in the repository.

## MetaMask bounty — trader-focused capabilities

IN ONE SENTENCE — The plugin gives a MetaMask Agent Wallet a complete perps trading loop on Monad (Perpl), and every wallet action still goes through MetaMask.

WHAT A TRADER CAN DO —
1. Open the account: "mm perpl setup" approves AUSD, creates the Perpl account and turns on one-click trading; "mm perpl deposit" adds collateral. All of these are wallet transactions.
2. Authorise trading: "mm perpl enroll" has the wallet sign Perpl's authorisation for a trade-only key. That key can never withdraw (a Perpl rule) and expires after 30 days.
3. Trade: "mm perpl order" opens market or limit positions, by size or by dollar amount, with leverage and a dry-run mode; "mm perpl close" closes all or part of a position.
4. Stay inside limits: a cap per trade and per day, max leverage, allowed markets, max open positions and a human yes, all checked before anything is sent. It is modelled on MetaMask's Guard Mode, because orders signed with the key don't pass through the wallet.
5. Watch risk: "mm perpl positions" and "mm perpl risk" show profit and loss, margin and the estimated liquidation price; "risk" is made for cron jobs and returns alerts. A live dashboard shows the same to the human: https://perpl-agent-monitor.vercel.app
6. Get ideas: "mm perpl signals" turns Nansen smart-money data into a direction, its evidence and a suggested size that respects the limits.

HOW IT STAYS INSIDE METAMASK — Every transaction and signature is handed to the plugin SDK's wallet executor, so MetaMask's policy, simulation, Blockaid scan and 2FA apply. The plugin never sees a private key. Least privilege: only setup, deposit and enroll may submit through the wallet; trading commands only read the wallet's address; markets, guard and signals have no wallet access at all.

VERIFIED LIVE — On Monad testnet with a MetaMask server wallet: setup, deposit, enroll, a filled order and a filled close.

## MetaMask bounty — SKILL.md

https://github.com/akugone/mm-plugin-perpl/blob/main/skills/perpl-trading/SKILL.md

## Nansen bounty — integration

IN ONE SENTENCE — "mm perpl signals" turns Nansen's smart-money data into a trade idea for each Perpl market, with the evidence and a size that already respects the user's limits.

WHAT IT USES — Two Nansen API endpoints: smart-money netflow (are smart wallets buying or selling the asset? one call across Monad, Ethereum, Base, Arbitrum and Solana) and smart-money perp trades (how are they positioning on the same asset?).

WHAT IT ADDS TO THE RAW DATA —
1. It maps each Perpl market to the tokens Nansen reports (BTC to WBTC and cbBTC, ETH to WETH and stETH, and so on).
2. It only counts new or increased positions, and weighs them by conviction: full weight from 100,000 dollars opened across 3 trades, so a single 98 dollar trade can't create an idea.
3. For each market it gives a direction (long, short or neutral), a score from -1 to +1, a confidence level, and evidence a human can check, for example "+$538.6k long vs +$4.9k short across 4 trades".
4. It suggests an order already sized to the user's guardrails, and never places it: the agent shows the idea, the user decides, and the order command checks every limit again.

FOR AGENTS — JSON output, a skill file that tells agents how to present an idea, and the Nansen credits spent on each run.

VERIFIED LIVE — Run against the live Nansen API on 2026-10-07. The first run caught a field mismatch, now fixed and covered by tests. Nansen returns no smart-money netflow for Monad yet, which is why netflow also reads the chains where the same assets trade.

## Perpl API bounty — link

https://github.com/akugone/mm-plugin-perpl

## Perpl Analytics / Risk Tool bounty — dashboard link

https://perpl-agent-monitor.vercel.app/
