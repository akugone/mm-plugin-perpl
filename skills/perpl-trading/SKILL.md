---
name: perpl-trading
description: Trade perpetuals on Perpl (Monad) through the MetaMask Agent Wallet CLI plugin `mm perpl` — setup, guardrails, orders, risk checks, Nansen signals. Use when the user wants to open/close a perp position on Monad, check their Perpl positions or risk, or asks for trade ideas.
---

# Perpl trading with the MetaMask Agent Wallet (`mm perpl`)

Run every command through the terminal with `--json`. The user never types shell commands; you do, and you relay the result.

## Start with `mm perpl status --json`
Its `nextStep` field tells you exactly what is missing. Follow it literally:
1. No exchange account → `mm perpl setup --chain-id <id> --deposit <AUSD>`. Three wallet transactions (approve, createAccount, allowOrderForwarding), each through MetaMask's policy and 2FA. This also creates the Perpl profile an API key attaches to, so it comes BEFORE enroll. Ask the user for the deposit amount; never pick it yourself. The wallet needs AUSD and a little MON for gas. Testnet is chain 10143, mainnet 143.
2. No API key → `mm perpl enroll --chain-id <id>`. The user's MetaMask wallet signs an EIP-712 authorization (they may get a 2FA on their phone or e-mail). The key is trade-only; it can never withdraw. `PERPL_PROFILE_NOT_FOUND` means step 1 has not happened yet.
3. Forwarding disabled → `mm perpl setup --enable-forwarding-only --chain-id <id>`.

## The guard is the safety net — explain it, never bypass it
Orders go through Perpl's API and are forwarded by the exchange, so MetaMask's Guard Mode does not see them. The plugin's own guard does: max notional per order, max leverage, rolling 24h notional cap, max open positions, allowed markets, confirmation. `mm perpl guard --json` shows it.
- A `GUARD_BLOCKED` error is a decision for the user, not a retry. Tell them which rule blocked and that raising it is `mm perpl guard --max-... <value>`. Do not raise a limit on your own initiative.
- `CONFIRMATION_REQUIRED`: restate the exact order (market, side, size or notional, leverage, order type, chain) to the user, get an explicit yes, then re-run the same command with `--yes`. Never add `--yes` before the user agreed to that exact order.
- Never set `--require-confirm false` unless the user explicitly asks for unattended trading and understands the caps.

## Reads are free
`mm perpl markets`, `mm perpl positions`, `mm perpl risk`, `mm perpl signals` never move funds. `mm perpl signals` needs `NANSEN_API_KEY` in the environment and spends Nansen credits; use `--skip-perps` to save credits.

## Placing and closing
- Prefer `--notional-usd` over `--size` when the user speaks in dollars; the plugin derives the size from the mark price.
- `--dry-run` runs every check and shows the exact frame without sending. Use it when the user hesitates.
- `mm perpl close --market <SYMBOL> --yes` closes the whole position at market; `--size` for a partial close.
- After a write, report `status`, `fillPrice`, `filledSize`. `FORWARDED` means accepted but not yet confirmed on chain: check `mm perpl positions` a few seconds later. `FAILED` with a `failureReason` means nothing is open.

## Signals are ideas, not instructions
`mm perpl signals` combines Nansen smart-money netflow on Monad and smart-money perp positioning. Present the bias, score, confidence and evidence lines; the `suggestion` is already capped by the guard. The user decides. Never chain `signals` into `order` without the user's explicit go on the specific order.

## Cron / unattended
Only reads run well unattended: `mm perpl risk --json` every N minutes and relay `alerts` when `ok` is false. Writes need a human at the confirmation, or a deliberate `--require-confirm false` with tight caps the user set themselves.

## Never
- Never ask for, print, or store the wallet seed phrase or the Perpl API key secret. The plugin keeps the key at `~/.config/mm-plugin-perpl/credentials.json` (0600); `mm perpl enroll --forget` deletes it.
- Never present liquidation prices as exact: they are first-order estimates (see `note` in the output).
- Never trade a market the user did not name.
