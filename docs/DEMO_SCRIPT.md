# Demo scripts — mm-plugin-perpl (Metropolis)

Three videos, recorded in one session and cut three ways:

| Video | Length | Used for |
|---|---|---|
| 1. Main demo | 2:00 | Technical demo · Perpl API bounty · Perpl Analytics bounty · Nansen bounty (optional) |
| 2. MetaMask cut | ~4:00 | MetaMask "Best Agent Wallet Plugin" bounty |
| 3. Pitch | 2:00 | Pitch video |

Narration in English (judges), stage directions in *italics*.

---

## 1. Main demo — 2:00

**The shot**: terminal on the left half of the screen, the dashboard on the right half. Every command on the left
shows up on the right within 5 seconds. That one frame proves the bot *and* the risk tool.

### Setup (before you hit record)

```bash
export PERPL_CHAIN_ID=10143                          # no --chain-id on screen
read -s NANSEN_API_KEY && export NANSEN_API_KEY      # paste the key, nothing is echoed
mm perpl guard --reset                               # default guard: $100/order, 3x, $300/24h, confirm
mm perpl status                                      # ready: true, account 958, ~1100 AUSD, 0 positions
clear
```

- Terminal: font ≥ 18 pt, dark theme, ~95 columns wide.
- Browser (right half): https://perpl-agent-monitor.vercel.app/ in light mode (◐ button), zoom 110 %, scrolled to the
  top. The default address is the agent wallet, nothing to type.
- The account must be flat at the start (the dashboard says "Risk OK. Account #958 is flat").
- Rehearse once without recording: `signals` costs 10 Nansen credits per run (free tier: 10 a day, 75 left on
  2026-10-07), so rehearse with `--skip-perps` (5 credits) or skip it in the rehearsal.

### Script (≈ 230 words of narration: about 1:40 spoken, the rest is command output)

**0:00–0:12 — Hook** *(both windows visible, nothing running)*
> "This is mm-plugin-perpl. It gives a MetaMask Agent Wallet a new skill: trading perps on Perpl, Monad's on-chain
> exchange. On the left, the agent's terminal. On the right, what the human sees."

**0:12–0:30 — Idea** *(left)*
```bash
mm perpl signals --markets BTC,ETH
```
> "The agent asks Nansen what smart money is doing. Over half a million dollars of long opens on BTC: a long bias,
> with the evidence, and a suggested size already capped by the guard. It never trades on its own."

*(Read the numbers that actually come out; if both are neutral, say "no clear signal today, so the agent stays
small".)*

**0:30–0:50 — The guard says no** *(left)*
```bash
mm perpl order --market BTC --side long --notional-usd 500 --leverage 10
```
> "Perpl orders go through an API key, so MetaMask's Guard Mode never sees them. The plugin has its own guard.
> Five hundred dollars at 10x: refused before anything reaches the exchange. Raising a limit is a decision,
> never a retry."

**0:50–1:20 — A real order** *(left, answer `y` at the prompt; then look right)*
```bash
mm perpl order --market BTC --side long --notional-usd 20 --leverage 2
```
> "Twenty dollars at 2x is within the guard. The plugin states the exact order and asks for a yes. Filled on
> Perpl. And on the right, without touching anything: the position, its PnL, and how far it is from liquidation."

*(Wait for the dashboard refresh — up to 5 s — before saying "and on the right".)*

**1:20–1:42 — The human's view** *(right; move the mouse to what you name)*
> "Margin ratio, maintenance margin, estimated liquidation price, and the same alert thresholds the agent's risk
> check uses from a cron job. Below, the agent's activity, each line linked to the explorer. All of it read
> straight from the Perpl contract: no API key, no backend."

*(Scroll down to "Agent activity": the "Opened" row is there.)*

**1:42–1:55 — Close** *(left, answer `y`)*
```bash
mm perpl close --market BTC
```
> "Closing reduces risk, so no cap blocks it, but it still asks. Closed, and the dashboard shows the realised PnL."

**1:55–2:00 — Outro** *(both windows)*
> "mm-plugin-perpl: perps on Monad, for agents you can trust."

### If something goes wrong on camera

- Order rejected or `FAILED`: say "the exchange rejected it, nothing is open" and re-run; it's a real exchange.
- Dashboard slow: wait one refresh (5 s); don't reload the page (the activity scan restarts).
- `signals` out of credits (`NANSEN_CREDITS`): cut that segment, the video still stands at ~1:40.

---

## 2. MetaMask bounty demo — max 5:00 (field "Submit a demo video … showing real flows")

Requirement: all transactions go through the Agent Wallet, no key handling, no bypass of signing, policy or MFA.
Reuse the main demo and add the wallet-side flows in front of it.

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

**2:40–4:20 — Trading loop** — the main demo from 0:30 to 1:55 (guard refusal, order + dashboard, close).

**4:20–4:40 — Agent skill** *(show `skills/perpl-trading/SKILL.md` on GitHub)*
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

- Upload to YouTube (unlisted) or Loom.
- Main demo link → "Technical demo video", Perpl API "demo video", Perpl Analytics "demo video", Nansen "optional
  demo video".
- MetaMask cut link → MetaMask "demo video (up to 5 mins)". Pitch link → "Pitch video".
- Optional 30 s "Product advertisement": main demo 0:30–1:20 (guard refusal → filled order on the dashboard).
