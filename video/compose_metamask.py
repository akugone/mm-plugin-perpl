#!/usr/bin/env python3
"""Assemble the MetaMask bounty cut from the take in out/metamask (make_tape.py metamask … + record.mjs).

Plugin first: an AI agent trades perps in plain English with the human's dashboard alongside; then what the plugin
adds (a trade-only key signed by the wallet, a guard where Guard Mode can't see); then a short proof that every
on-chain action goes through MetaMask (custody, Intent lines, the wallet's request log).

    TAKE_DIR is set to out/metamask unless given.   .venv/bin/python compose_metamask.py
"""
import os

os.environ.setdefault("TAKE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "metamask"))
import compose as C  # noqa: E402  (reads TAKE_DIR at import)

SUBS = {
    "hook": ["mm-plugin-perpl teaches MetaMask's Agent Wallet to trade perps on Perpl, Monad's on-chain exchange.",
             "An AI agent trades in plain English. On the right, the human's dashboard."],
    "a500": ["Ask for 500 dollars at 10x: that's over the plugin's limits. The agent refuses and won't raise them on its own.",
             "Those limits are the plugin's guard. Perps orders use an exchange key, so MetaMask's Guard Mode never sees them."],
    "a20": ["20 dollars at 2x fits. The agent runs a dry run, states the exact order and waits for a yes."],
    "ayes": ["Yes. The order goes to Perpl and fills in seconds."],
    "human": ["The human's dashboard shows the position, its margin and its distance to liquidation, read straight from the Perpl contract."],
    "close": ["Closing works the same way: the agent asks first, then closes."],
    "key": ["How can the agent trade at all? The MetaMask wallet signs Perpl's authorisation for a key that can trade, but can never withdraw."],
    "proof": ["And every on-chain action still goes through MetaMask. The key stays in its enclave, in Guard mode.",
              "Adding collateral is two wallet transactions, announced by MetaMask's Intent lines. The plugin simulates each one first, so a doomed transaction never reaches the wallet.",
              "And MetaMask logs every request the plugin made."],
    "outro": ["Perps trading for the MetaMask Agent Wallet, with a guard where MetaMask can't see.",
              "Along the way, we reported two issues to MetaMask."],
}

CARDS = {
    "intro": {"title": "mm-plugin-perpl",
              "text": "Perps on Monad for the MetaMask Agent Wallet, driven by an AI agent, inside limits it can't get around."},
    "outro": {"title": "mm-plugin-perpl", "text": "A guard where MetaMask can't see. Everything else through MetaMask.",
              "links": ["perpl-agent-monitor.vercel.app", "github.com/akugone/mm-plugin-perpl",
                        "MetaMask/agent-wallet-plugin-template #5 · #6"]},
}


def plan(take):
    """Plugin first: the agent trades, then what the plugin adds, then a short proof that everything goes through
    MetaMask. Shots are source ranges of the take, so they can be reordered freely."""
    V, dur, cmds, clears = take["V"], take["dur"], take["cmds"], take["clears"]
    if len(cmds) < 11 or len(clears) < 7:
        raise SystemExit(f"take incomplete: {len(cmds)} commands, {len(clears)} clears")
    addr, _mode, _policy, deposit, _requests, _enroll, _a500, _a20, ayes, _aclose, ayes2 = cmds[:11]
    c = [V(x) for x in clears[:7]]  # before: policy, deposit, requests, enroll, a500, a20, aclose
    t = lambda x: V(x["start"])  # noqa: E731
    e = lambda x: V(x["end"])  # noqa: E731
    return [
        {"name": "intro", "layout": "card-intro", "start": 0.0, "end": 5.0, "beat": "hook"},
        {"name": "hook", "layout": "split", "start": 3.0, "end": t(addr) - C.typing(addr), "beat": "hook"},
        # 1. the agent trades
        {"name": "agent-500", "layout": "term", "start": c[4], "end": c[5], "beat": "a500", "frame": c[5] - 0.3, "mode": "output"},
        {"name": "agent-20", "layout": "term", "start": c[5], "end": t(ayes) + 1.0, "beat": "a20", "frame": t(ayes) - 0.2, "mode": "output"},
        {"name": "agent-yes-run", "layout": "split", "start": t(ayes) + 1.0, "end": e(ayes), "beat": "ayes"},
        {"name": "agent-yes-out", "layout": "term", "start": e(ayes), "end": e(ayes) + 5.0, "beat": "ayes", "frame": e(ayes) + 4.5, "mode": "output"},
        {"name": "human-pos", "layout": "dash", "start": e(ayes) + 5.0, "end": e(ayes) + 15.0, "beat": "human", "dash_keys": ("stats", "alerts")},
        {"name": "agent-close", "layout": "term", "start": c[6], "end": t(ayes2) + 1.0, "beat": "close", "frame": t(ayes2) - 0.2, "mode": "output"},
        {"name": "agent-close-yes", "layout": "split", "start": t(ayes2) + 1.0, "end": min(dur, e(ayes2) + 4.0), "beat": "close"},
        # 2. what the plugin adds: a trade-only key, signed by the wallet
        {"name": "enroll", "layout": "term", "start": c[3], "end": c[4], "beat": "key", "frame": c[4] - 0.3, "mode": "output", "max_h": 1000},
        # 3. proof it stays inside MetaMask, condensed
        {"name": "custody", "layout": "term", "start": c[0] - 6.0, "end": c[0], "beat": "proof", "frame": c[0] - 0.3, "mode": "output", "max_h": 800},
        {"name": "deposit-intent", "layout": "term", "start": c[1], "end": min(t(deposit) + 9.0, e(deposit) - 1.0), "beat": "proof", "frame": t(deposit) + 8.5, "mode": "typing", "typing_h": 560},
        {"name": "deposit-out", "layout": "term", "start": e(deposit) - 0.5, "end": e(deposit) + 7.0, "beat": "proof", "frame": c[2] - 0.3, "mode": "output", "max_h": 760},
        {"name": "requests", "layout": "term", "start": c[2] + 2.5, "end": c[2] + 10.5, "beat": "proof", "frame": c[3] - 0.3, "mode": "output"},
        {"name": "outro", "layout": "card-outro", "start": 0.0, "end": 8.0, "beat": "outro"},
    ]


if __name__ == "__main__":
    take = C.load_take()
    C.assemble(take, plan(take), SUBS, CARDS, "demo-metamask")
