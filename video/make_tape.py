#!/usr/bin/env python3
"""Write the VHS tape for the main demo.

  python3 make_tape.py real        -> out/take.tape : signals, guard refusal, a REAL $20 order, a REAL close
  python3 make_tape.py rehearsal   -> out/take.tape : same rhythm, read-only commands only (nothing is sent)

The shell logs when each command starts and ends (hooks.zsh); compose.mjs uses that log to cut the shots, sync the
dashboard capture and time the subtitles. Sleeps below give each shot the time its narration needs.
"""
import os
import sys

mode = sys.argv[1] if len(sys.argv) > 1 else "rehearsal"
if mode not in ("real", "rehearsal"):
    sys.exit("usage: make_tape.py real|rehearsal")

here = os.path.dirname(os.path.abspath(__file__))
theme = (
    '{ "name": "notion-dark", "background": "#191919", "foreground": "#ebebea", "cursor": "#ebebea", '
    '"selection": "#3a3a3a", "black": "#191919", "red": "#e57873", "green": "#4dab9a", "yellow": "#d9a23e", '
    '"blue": "#7aa7e6", "magenta": "#b08fd8", "cyan": "#6fc2c2", "white": "#d4d4d2", "brightBlack": "#6f6e6b", '
    '"brightRed": "#e57873", "brightGreen": "#4dab9a", "brightYellow": "#d9a23e", "brightBlue": "#7aa7e6", '
    '"brightMagenta": "#b08fd8", "brightCyan": "#6fc2c2", "brightWhite": "#ffffff" }'
)
PROMPT = r"/agent \$ ?$/"

if mode == "real":
    signals = "mm perpl signals --markets BTC,ETH"
    order = "mm perpl order --market BTC --side long --notional-usd 20 --leverage 2"
    close = "mm perpl close --market BTC"
else:
    signals = "mm perpl status"  # no Nansen credits spent in rehearsal
    order = "mm perpl order --market BTC --side long --notional-usd 20 --leverage 2 --dry-run"
    close = "mm perpl positions"

lines = [
    "Output out/term.mp4",
    'Set Shell "zsh"',
    "Set Width 2000",
    "Set Height 1736",
    "Set FontSize 35",
    'Set FontFamily "Menlo"',
    "Set LineHeight 1.25",
    "Set Padding 60",
    "Set TypingSpeed 45ms",
    "Set Framerate 25",
    "Set WaitTimeout 60s",
    f"Set Theme {theme}",
    'Env PERPL_CHAIN_ID "10143"',
    "Hide",
    f'Type "source {here}/hooks.zsh; clear"',
    "Enter",
    "Show",
    # 0:00 hook — empty prompt while the intro card and the hook subtitle play
    "Sleep 12s",
    # idea: Nansen signals
    f'Type "{signals}"', "Sleep 600ms", "Enter",
    f"Wait+Line {PROMPT}", "Sleep 11s",
    # the guard says no (no --dry-run needed: the guard refuses before anything is sent)
    'Hide', 'Type "clear"', 'Enter', 'Show',
    'Type "mm perpl order --market BTC --side long --notional-usd 500 --leverage 10"', "Sleep 600ms", "Enter",
    f"Wait+Line {PROMPT}", "Sleep 13s",
    # a real order, confirmed on screen
    'Hide', 'Type "clear"', 'Enter', 'Show',
    f'Type "{order}"', "Sleep 600ms", "Enter",
]
if mode == "real":
    lines += ["Wait+Screen /Send this order/", "Sleep 1500ms", 'Type "y"', "Sleep 400ms", "Enter"]
lines += [
    f"Wait+Line {PROMPT}",
    # the human's view: the dashboard carries the next ~30 s
    "Sleep 32s",
    # close
    'Hide', 'Type "clear"', 'Enter', 'Show',
    f'Type "{close}"', "Sleep 600ms", "Enter",
]
if mode == "real":
    lines += ["Wait+Screen /Send this close order/", "Sleep 1200ms", 'Type "y"', "Sleep 400ms", "Enter"]
lines += [
    f"Wait+Line {PROMPT}",
    # dashboard catches up with the close, then the outro card
    "Sleep 10s",
]

os.makedirs(os.path.join(here, "out"), exist_ok=True)
path = os.path.join(here, "out", "take.tape")
with open(path, "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"{mode} tape written to {path}")
