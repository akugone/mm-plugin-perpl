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

## 2. MetaMask cut — ~4:15 (MetaMask bounty field "Submit a demo video (up to 5 mins) showing real flows")

What MetaMask's judges check: *all transactions go through the Agent Wallet — no key/token handling, no bypass of
signing, policy, or MFA*. So this cut puts the wallet side first, then reuses the trading loop of the main demo.

### Setup

Same as the main demo (`PERPL_CHAIN_ID`, guard reset, account flat, dashboard on the right), plus:

- A second browser tab on the agent wallet's explorer page:
  https://testnet.monadscan.com/address/0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab
- `package.json` open in your editor, scrolled to the `"mm"` block (the manifest with per-command capabilities).
- `~/.config/mm-plugin-perpl/credentials.json` must **not** be shown on screen.
- Optional, for the strongest shot: record the **install consent** beforehand, in a separate take —
  `mm plugins uninstall mm-plugin-perpl`, then `mm plugins install "file:$PWD"` *without* `--accept-permissions`,
  and film MetaMask's consent prompt listing the capabilities. Re-install with the README's procedure afterwards.

### Script

**0:00–0:20 — Hook** *(terminal full screen)*
> "MetaMask's Agent Wallet lets an AI agent hold funds without ever holding keys. mm-plugin-perpl gives that wallet
> a trading superpower: perpetuals on Perpl, Monad's on-chain exchange. And every wallet action still goes through
> MetaMask."

**0:20–0:50 — Custody and policy**
```bash
mm wallet address
mm wallet policy get
```
> "This is a MetaMask server wallet: the key lives in MetaMask's secure enclave, not on this machine. Its policy
> lists the allowed chains, Monad testnet included, and a rolling 24-hour outflow limit. The plugin can't change
> any of this."

**0:50–1:20 — Least privilege, enforced by mm** *(editor: `package.json` › `"mm"`; or the consent take)*
> "The plugin declares a capability per command, and mm enforces it after the user consents at install. Only
> setup, deposit and enroll may submit through the wallet. Trading commands only read the wallet's address.
> Markets, guard and signals get no wallet access at all. Reading the seed or changing mm's config is refused by
> design."

**1:20–2:05 — Wallet transactions through MetaMask's pipeline** *(terminal)*
```bash
mm perpl deposit --amount 50
```
> "Adding collateral is two wallet transactions: approve, then deposit. Look at the lines starting with
> 'Intent': that's MetaMask describing what it is about to sign. The plugin never builds a signature: it hands
> the transaction to the wallet executor, and MetaMask simulates it, scans it with Blockaid, checks the policy,
> and asks for 2FA when the policy requires it."

*(If a 2FA e-mail arrives, show it and approve it on camera. On testnet the AUSD token has no price, so the USD
outflow limit usually doesn't trigger; say: "on testnet this token is unpriced, so no 2FA here; on mainnet the
outflow limit would ask me".)*

*(Switch to the explorer tab, refresh: the approve and the deposit appear, sent by the agent wallet.)*
> "Both transactions, sent by the agent wallet itself."

**2:05–2:40 — A signature for a trade-only key**
```bash
mm perpl enroll --force
```
> "To trade without a transaction per order, Perpl uses API keys. The plugin generates one locally, and MetaMask
> signs Perpl's EIP-712 authorisation: again through the wallet, again subject to its policy. The key can trade
> but can never withdraw: that's a Perpl rule, not a promise of mine. It expires in 30 days."

*(`--force` replaces the stored key; the old one simply expires. Don't scroll to the stored path's contents.)*

**2:40–2:55 — The gap, and how the plugin closes it** *(terminal + dashboard, split screen from here)*
> "Orders signed by that key don't go through the wallet, so MetaMask's Guard Mode can't see them. That's why the
> plugin ships its own guard, shaped like Guard Mode: a cap per order, a rolling 24-hour cap like the outflow
> limit, leverage and market allowlists, and a human yes on every order."

**2:55–4:20 — Trading loop** — the main demo from 0:30 to 1:55: guard refusal, real order with confirmation and the
dashboard updating, the human's view, close.

**4:20–4:40 — Any agent** *(browser: `skills/perpl-trading/SKILL.md` on GitHub)*
> "A bundled skill teaches any agent driving mm the safe flow — Hermes, Claude Code, Codex, Cursor: confirm the
> exact order with the user before adding --yes, and never raise a limit on its own."

**4:40–4:50 — Outro**
> "Keys in MetaMask, transactions through MetaMask, and a guard where MetaMask can't see. mm-plugin-perpl."

### Notes

- Total ≈ 4:50 with the reused loop; trim the hook or the skill shot if the cut runs over 5:00.
- Never show `credentials.json`, the Nansen key, or the `enroll` output's key material (mm already masks it, but
  don't linger on it).
- The deposit adds 50 AUSD to account 958: harmless, and it makes the "Deposit" row appear in the dashboard's
  activity feed if the browser is visible.

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
