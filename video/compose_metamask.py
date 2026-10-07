#!/usr/bin/env python3
"""Assemble the MetaMask bounty cut from the take in out/metamask (make_tape.py metamask … + record.mjs).

Wallet side first (custody, policy, a deposit through MetaMask's pipeline, MetaMask's own request log, a signature for
a trade-only key), then an AI agent trading in plain English with the human's dashboard alongside.

    TAKE_DIR is set to out/metamask unless given.   .venv/bin/python compose_metamask.py
"""
import os

os.environ.setdefault("TAKE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "metamask"))
import compose as C  # noqa: E402  (reads TAKE_DIR at import)

SUBS = {
    "hook": ["This is mm-plugin-perpl. It gives the MetaMask Agent Wallet a trading superpower: perps on Perpl, Monad's on-chain exchange.",
             "And everything the wallet does still goes through MetaMask."],
    "custody": ["A MetaMask server wallet: the key lives in MetaMask's secure enclave, never on this machine.",
                "And the wallet runs in Guard mode."],
    "policy": ["Its policy lists the allowed chains, Monad testnet included, and a rolling 24-hour outflow limit.",
               "The plugin can't change any of it."],
    "deposit": ["Adding collateral takes two wallet transactions. The 'Intent' lines are MetaMask stating what it is about to sign.",
                "Each one is simulated, scanned by Blockaid and checked against the policy. On mainnet, the outflow limit would ask for 2FA."],
    "requests": ["MetaMask keeps its own log of every request the plugin made: intent, status and transaction hash."],
    "enroll": ["To trade without a transaction per order, the wallet signs Perpl's authorisation for a key that can trade but never withdraw."],
    "a500": ["Now an AI agent drives the wallet in plain English, through the plugin's skill.",
             "500 dollars at 10x: the plugin's guard refuses, and the agent won't raise the limits on its own."],
    "a20": ["20 dollars at 2x is within the limits. The agent states the exact order and waits for a yes."],
    "ayes": ["Yes. The order goes to Perpl and fills in seconds."],
    "human": ["And on the human's dashboard: the position, its margin and its distance to liquidation, read straight from the Perpl contract."],
    "close": ["Closing works the same way: the agent asks first, then closes."],
    "outro": ["Keys in MetaMask, transactions through MetaMask, and a guard where MetaMask can't see.",
              "Along the way, we reported two issues to MetaMask's plugin template."],
}

CARDS = {
    "intro": {"title": "mm-plugin-perpl",
              "text": "A trading superpower for the MetaMask Agent Wallet: perps on Monad, driven by an AI agent, through the wallet."},
    "outro": {"title": "mm-plugin-perpl", "text": "Keys in MetaMask. Transactions through MetaMask. A guard where MetaMask can't see.",
              "links": ["perpl-agent-monitor.vercel.app", "github.com/akugone/mm-plugin-perpl",
                        "MetaMask/agent-wallet-plugin-template #5 · #6"]},
}


def plan(take):
    V, dur, cmds, clears = take["V"], take["dur"], take["cmds"], take["clears"]
    if len(cmds) < 11 or len(clears) < 7:
        raise SystemExit(f"take incomplete: {len(cmds)} commands, {len(clears)} clears")
    addr, _mode, _policy, deposit, _requests, _enroll, _a500, _a20, ayes, _aclose, ayes2 = cmds[:11]
    c = [V(x) for x in clears[:7]]  # before: policy, deposit, requests, enroll, a500, a20, aclose
    t = lambda x: V(x["start"])  # noqa: E731
    e = lambda x: V(x["end"])  # noqa: E731
    return [
        {"name": "intro", "layout": "card-intro", "start": 0.0, "end": 3.0, "beat": "hook"},
        {"name": "hook", "layout": "split", "start": 3.0, "end": t(addr) - C.typing(addr), "beat": "hook"},
        {"name": "custody", "layout": "term", "start": t(addr) - C.typing(addr), "end": c[0], "beat": "custody", "frame": c[0] - 0.3, "mode": "output", "max_h": 800},
        {"name": "policy", "layout": "term", "start": c[0], "end": c[1], "beat": "policy", "frame": c[1] - 0.3, "mode": "output"},
        {"name": "deposit-intent", "layout": "term", "start": c[1], "end": t(deposit) + 4.0, "beat": "deposit", "frame": t(deposit) + 3.5, "mode": "typing", "typing_h": 560},
        {"name": "deposit-out", "layout": "term", "start": t(deposit) + 4.0, "end": c[2], "beat": "deposit", "frame": c[2] - 0.3, "mode": "output", "max_h": 1000},
        {"name": "requests", "layout": "term", "start": c[2], "end": c[3], "beat": "requests", "frame": c[3] - 0.3, "mode": "output"},
        {"name": "enroll", "layout": "term", "start": c[3], "end": c[4], "beat": "enroll", "frame": c[4] - 0.3, "mode": "output", "max_h": 1000},
        {"name": "agent-500", "layout": "term", "start": c[4], "end": c[5], "beat": "a500", "frame": c[5] - 0.3, "mode": "output"},
        {"name": "agent-20", "layout": "term", "start": c[5], "end": t(ayes) + 1.0, "beat": "a20", "frame": t(ayes) - 0.2, "mode": "output"},
        {"name": "agent-yes-run", "layout": "split", "start": t(ayes) + 1.0, "end": e(ayes), "beat": "ayes"},
        {"name": "agent-yes-out", "layout": "term", "start": e(ayes), "end": e(ayes) + 5.0, "beat": "ayes", "frame": e(ayes) + 4.5, "mode": "output"},
        {"name": "human-pos", "layout": "dash", "start": e(ayes) + 5.0, "end": e(ayes) + 14.0, "beat": "human", "dash_keys": ("stats", "alerts")},
        {"name": "human-split", "layout": "split", "start": e(ayes) + 14.0, "end": c[6], "beat": "human"},
        {"name": "agent-close", "layout": "term", "start": c[6], "end": t(ayes2) + 1.0, "beat": "close", "frame": t(ayes2) - 0.2, "mode": "output"},
        {"name": "agent-close-yes", "layout": "split", "start": t(ayes2) + 1.0, "end": min(dur, e(ayes2) + 6.0), "beat": "close"},
        {"name": "outro", "layout": "card-outro", "start": min(dur, e(ayes2) + 6.0), "end": max(dur, e(ayes2) + 13.0), "beat": "outro"},
    ]


if __name__ == "__main__":
    take = C.load_take()
    C.assemble(take, plan(take), SUBS, CARDS, "demo-metamask")
