# Demo scripts — mm-plugin-perpl (Metropolis)

Three videos are required. Narration in English (judges), stage directions in *italics*.
Record the terminal at a large font (≥ 18 pt), dark theme, one command per shot. Clear `~/.config/mm-plugin-perpl/ledger.json`
before recording if you want the 24 h counter to start at $0.

Before recording, check:

```bash
mm perpl status --chain-id 10143          # ready: true, account 958, ~1000 AUSD, 0 positions
mm wallet balance --testnet-chain-ids 10143 --token-contracts 0xa9012a055bd4e0edff8ce09f960291c09d5322dc
```

---

## 1. Technical demo — max 3:00 (field "Technical demo video")

Rule from the form: show the working product, not slides or a code walkthrough.

**0:00–0:15 — Hook** *(terminal on screen, Perpl testnet app in a second window)*
> "This is mm-plugin-perpl. It gives a MetaMask Agent Wallet a new skill: trading perpetuals on Perpl, Monad's
> on-chain perps exchange, with guardrails an AI agent can't talk its way around."

**0:15–0:35 — Where we stand**
```bash
mm perpl status --chain-id 10143
```
> "One command tells the agent where it stands: the wallet is a MetaMask server wallet, its key never leaves
> MetaMask. It has a Perpl account with collateral, a trade-only API key, and the guard's limits."

**0:35–0:55 — Markets**
```bash
mm perpl markets --chain-id 10143
```
> "Live Perpl markets: mark price, funding, open interest, fees. Everything is JSON, so any agent can use it."

**0:55–1:25 — The guard says no** *(the key moment, take your time)*
```bash
mm perpl order --chain-id 10143 --market BTC --side long --notional-usd 500 --leverage 10
```
> "Perpl orders go through an API key, so MetaMask's own Guard Mode never sees them. The plugin closes that gap.
> Five hundred dollars at 10x? Refused before anything reaches the exchange: over the per-order cap, over the
> max leverage, over the rolling 24-hour cap. Raising a limit is a deliberate command, never a retry."

**1:25–2:00 — A real order** *(answer `y` at the prompt)*
```bash
mm perpl order --chain-id 10143 --market BTC --side long --notional-usd 20 --leverage 2
```
> "Twenty dollars at 2x is within the guard. The plugin states the exact order and asks for confirmation. An agent
> must get the user's yes on that exact order before it can add --yes. Filled, with the fill price."

**2:00–2:25 — Monitor**
```bash
mm perpl positions --chain-id 10143
mm perpl risk --chain-id 10143 --json
```
> "Positions with PnL, margin ratio and an estimated liquidation price. And risk returns ok:false plus alerts when a
> threshold is crossed, so a cron job or an agent can ping you on Telegram."

**2:25–2:45 — Close**
```bash
mm perpl close --chain-id 10143 --market BTC
```
> "Closing never hits the notional caps, because it reduces risk, but it still asks for confirmation. Closed."

**2:45–3:00 — Proof on chain** *(browser: testnet.monadscan.com/address/0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab)*
> "The account was opened by the MetaMask wallet itself: approve, create account, enable one-click trading,
> each through MetaMask's policy and 2FA. mm-plugin-perpl: perps on Monad, for agents you can trust."

---

## 2. MetaMask bounty demo — max 5:00 (field "Submit a demo video … showing real flows")

Requirement: all transactions go through the Agent Wallet, no key handling, no bypass of signing, policy or MFA.
Reuse video 1 and add the wallet-side flows in front of it.

**0:00–0:30 — Custody** *(terminal)*
```bash
mm wallet address
mm wallet policy get
```
> "A MetaMask server wallet: keys in MetaMask's TEE, a policy with allowed chains and a 24-hour outflow limit. The
> plugin only ever asks this wallet to act through the plugin SDK's walletExecutor."

**0:30–1:10 — Capabilities, by design** *(show `package.json` › `mm.commands`, or read them out)*
> "Only setup, deposit and enroll request wallet-submit. Trading commands only need wallet-read. Markets, guard and
> signals request nothing at all."

**1:10–2:00 — Wallet transactions through MetaMask's pipeline**
```bash
mm perpl deposit --chain-id 10143 --amount 100
```
> "Adding collateral is two wallet transactions, approve then depositCollateral, each simulated, scanned by
> Blockaid, checked against the policy, and 2FA'd when the policy says so."
*(If MetaMask sends a 2FA e-mail, show it and approve it on camera: it's the best possible shot for this bounty.)*

**2:00–2:40 — Wallet signature for a trade-only key** *(optional: re-run `enroll --force` only if you want to show it live)*
```bash
mm perpl enroll --chain-id 10143 --force
```
> "The API key is authorised by an EIP-712 signature from the MetaMask wallet. The key is trade-only: Perpl API
> keys can never withdraw. It expires in 30 days and is stored 0600."

**2:40–4:40 — Trading loop** — video 1 from 0:55 to 2:45 (guard refusal, order, positions/risk, close).

**4:40–5:00 — Agent skill** *(show `skills/perpl-trading/SKILL.md` on GitHub)*
> "A bundled skill teaches any agent the safe flow: confirm the exact order before --yes, never raise a cap on its
> own. Works with Hermes, Claude Code, Codex and Cursor."

---

## 3. Pitch — max 2:00 (field "Pitch video")

Face camera or voice over 3–4 simple visuals. Team, problem, why.

> **(0:00) Who.** "I'm Martin, developer relations at iExec, building agent tooling. I maintain the MetaMask plugin
> for Hermes Agent, now in Nous Research's official catalog, and this is my Metropolis build."
>
> **(0:15) Problem.** "AI agents are getting wallets, and MetaMask's Agent Wallet is the one people trust: keys in
> MetaMask, every transaction checked and 2FA'd. But agents still can't trade safely. On a perps exchange, orders go
> through an API key, so the wallet's safety net never sees them. One bad loop, one hallucinated size, and the
> account is gone."
>
> **(0:45) Solution.** "mm-plugin-perpl adds perps on Perpl, Monad's on-chain exchange, to the MetaMask Agent
> Wallet, with a guard built for the gap: per-order and daily caps, leverage limits, allowed markets, and human
> confirmation. The wallet sets up the account and authorises a trade-only key that can never withdraw. Then the
> agent trades, monitors risk, and asks you before anything it shouldn't do alone."
>
> **(1:15) Why now, why Monad.** "MetaMask opened plugins in September, and the ecosystem is empty. Monad gives
> perps the speed and cost that make agent trading practical, and Perpl's API makes order forwarding gasless for
> the agent. Every agent user is a new Perpl account and recurring volume."
>
> **(1:40) Ask.** "It's live on Monad testnet today and open source. Next: npm release, Hermes recipes for
> Telegram risk alerts, and mainnet. Thanks!"

---

## Checklist after recording

- Upload to YouTube (unlisted) or Loom; paste the three links in the form (technical demo, pitch, MetaMask bounty).
- Optional 30 s "Product advertisement": cut 1:25–2:00 of video 1 (guard refusal → filled order).
