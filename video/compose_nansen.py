#!/usr/bin/env python3
"""Assemble the optional Nansen bounty clip from out/nansen (make_tape.py nansen real + record.mjs).

The agent asks for smart-money ideas; the plugin calls Nansen (netflow + perp trades) and returns a bias, a score,
checkable evidence and a guard-sized suggestion, which the agent presents. Subtitles: edit SUBS to match the take.
"""
import os

os.environ.setdefault("TAKE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "nansen"))
import compose as C  # noqa: E402

SUBS = {
    "hook": ["mm-plugin-perpl turns Nansen's smart-money data into trade ideas for Perpl markets, inside the MetaMask Agent Wallet."],
    "ask": ["The agent asks for ideas. The plugin calls two Nansen endpoints: smart-money netflow and smart-money perp trades."],
    "result": ["It keeps only new positions and weighs them by conviction, so a single small trade can't make an idea.",
               "Each market gets a direction, a score and evidence a human can check, with a suggested size that already respects the user's limits.",
               "Nothing is placed until the user says yes."],
    "outro": ["Nansen data, turned into decisions an agent can act on safely."],
}

CARDS = {
    "intro": {"title": "mm-plugin-perpl × Nansen", "text": "Smart-money signals for Perpl markets, sized by the guard, presented by an AI agent."},
    "outro": {"title": "mm-plugin-perpl", "text": "Nansen smart money → a direction, the evidence, a guard-sized idea. Never an order on its own.",
              "links": ["github.com/akugone/mm-plugin-perpl", "perpl-agent-monitor.vercel.app"]},
}


def plan(take):
    V, dur, cmds = take["V"], take["dur"], take["cmds"]
    ask = cmds[0]
    t, e = V(ask["start"]), V(ask["end"])
    return [
        {"name": "intro", "layout": "card-intro", "start": 0.0, "end": 4.0, "beat": "hook"},
        {"name": "ask-type", "layout": "term", "start": t - C.typing(ask), "end": t + 1.5, "beat": "ask", "frame": t + 1.0, "mode": "typing"},
        {"name": "ask-wait", "layout": "term", "start": t + 1.5, "end": e, "beat": "ask", "frame": e - 0.3, "mode": "output"},
        {"name": "result", "layout": "term", "start": e, "end": min(dur, e + 16.0), "beat": "result", "frame": min(dur, e + 15.0) - 0.3, "mode": "output"},
        {"name": "outro", "layout": "card-outro", "start": 0.0, "end": 6.0, "beat": "outro"},
    ]


if __name__ == "__main__":
    take = C.load_take()
    C.assemble(take, plan(take), SUBS, CARDS, "demo-nansen")
