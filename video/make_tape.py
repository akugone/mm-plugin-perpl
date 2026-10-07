#!/usr/bin/env python3
"""Write the VHS tape for the main demo.

  python3 make_tape.py main real            -> out/main/take.tape : signals, guard refusal, a REAL $20 order and close
  python3 make_tape.py main rehearsal       -> out/main/take.tape : same rhythm, read-only commands only
  python3 make_tape.py metamask real        -> out/metamask/take.tape : wallet custody, a REAL deposit and re-enroll,
                                               then the agent trades in plain English (REAL order and close)
  python3 make_tape.py metamask rehearsal   -> same rhythm; dry-run deposit, read-only agent (order/close denied)

The shell logs when each command starts and ends (hooks.zsh); compose.mjs uses that log to cut the shots, sync the
dashboard capture and time the subtitles. Sleeps below give each shot the time its narration needs.
"""
import os
import sys

video = sys.argv[1] if len(sys.argv) > 1 else "main"
mode = sys.argv[2] if len(sys.argv) > 2 else "rehearsal"
if video not in ("main", "metamask") or mode not in ("real", "rehearsal"):
    sys.exit("usage: make_tape.py main|metamask real|rehearsal")

here = os.path.dirname(os.path.abspath(__file__))
theme = (
    '{ "name": "notion-dark", "background": "#191919", "foreground": "#ebebea", "cursor": "#ebebea", '
    '"selection": "#3a3a3a", "black": "#191919", "red": "#e57873", "green": "#4dab9a", "yellow": "#d9a23e", '
    '"blue": "#7aa7e6", "magenta": "#b08fd8", "cyan": "#6fc2c2", "white": "#d4d4d2", "brightBlack": "#6f6e6b", '
    '"brightRed": "#e57873", "brightGreen": "#4dab9a", "brightYellow": "#d9a23e", "brightBlue": "#7aa7e6", '
    '"brightMagenta": "#b08fd8", "brightCyan": "#6fc2c2", "brightWhite": "#ffffff" }'
)
PROMPT = r"/agent \$ ?$/"

def header(setup=""):
    return [
    f"Output out/{video}/term.mp4",
    'Set Shell "zsh"',
    "Set Width 2000",
    "Set Height 1736",
    "Set FontSize 35",
    'Set FontFamily "Menlo"',
    "Set LineHeight 1.25",
    "Set Padding 60",
    "Set TypingSpeed 45ms",
    "Set Framerate 25",
    "Set WaitTimeout 120s",
    f"Set Theme {theme}",
    'Env PERPL_CHAIN_ID "10143"',
    "Hide",
    # setup runs before the hooks are loaded, so it never shows up in the event log
    f'Type "{setup}source {here}/hooks.zsh; clear"',
    "Enter",
    "Show",
    ]


CLEAR = ["Hide", 'Type "clear"', "Enter", "Show"]


def cmd(text, wait=True, after="5s", typ=None):
    """Type a command, press Enter, wait for the prompt, then hold the shot."""
    quoted = f"'{text}'" if '"' in text else f'"{text}"'
    out = [f"Type {quoted}", "Sleep 600ms", "Enter"]
    if wait:
        out += [f"Wait+Line {PROMPT}"]
    return out + ([f"Sleep {after}"] if after else [])


def main_tape():
    if mode == "real":
        signals = "mm perpl signals --markets BTC,ETH"
        order = "mm perpl order --market BTC --side long --notional-usd 20 --leverage 2"
        close = "mm perpl close --market BTC"
    else:
        signals = "mm perpl status"  # no Nansen credits spent in rehearsal
        order = "mm perpl order --market BTC --side long --notional-usd 20 --leverage 2 --dry-run"
        close = "mm perpl positions"
    lines = header() + [
        # 0:00 hook — empty prompt while the intro card and the hook subtitle play
        "Sleep 12s",
        *cmd(signals, after="11s"),
        # the guard says no (no --dry-run needed: the guard refuses before anything is sent)
        *CLEAR, *cmd("mm perpl order --market BTC --side long --notional-usd 500 --leverage 10", after="13s"),
        # a real order, confirmed on screen
        *CLEAR, *cmd(order, wait=False, after=None),
    ]
    if mode == "real":
        lines += ["Wait+Screen /Send this order/", "Sleep 1500ms", 'Type "y"', "Sleep 400ms", "Enter"]
    lines += [f"Wait+Line {PROMPT}", "Sleep 32s", *CLEAR, *cmd(close, wait=False, after=None)]
    if mode == "real":
        lines += ["Wait+Screen /Send this close order/", "Sleep 1200ms", 'Type "y"', "Sleep 400ms", "Enter"]
    return lines + [f"Wait+Line {PROMPT}", "Sleep 10s"]


def metamask_tape():
    real = mode == "real"
    deposit = "mm perpl deposit --amount 50" + ("" if real else " --dry-run")
    enroll = "mm perpl enroll --force" if real else "mm perpl status"
    setup = f"export PATH={here}/agent:$PATH AGENT_SETTINGS={'demo-settings.json' if real else 'demo-settings-readonly.json'}; agent --new; "
    lines = header(setup) + [
        "Sleep 10s",                                   # intro card + hook
        *cmd("mm wallet address", after="3s"),         # custody
        *cmd("mm wallet trading-mode get", after="6s"),
        *CLEAR, *cmd("mm wallet policy get", after="11s"),
        *CLEAR, *cmd(deposit, after="12s"),            # wallet transactions through MetaMask
        *CLEAR, *cmd("mm wallet requests list", after="9s"),  # MetaMask's own log
        *CLEAR, *cmd(enroll, after="10s"),             # a signature for a trade-only key
        # the agent drives the wallet in plain English
        *CLEAR, *cmd('agent "Open a 500 dollar long on BTC at 10x."', after="9s"),
        *CLEAR, *cmd('agent "OK, make it 20 dollars at 2x."', after="4s"),
        *cmd('agent "Yes."' if real else 'agent "Not now. Show my positions instead."', after="24s"),
        *CLEAR, *cmd('agent "Close it."', after="3s"),
        *cmd('agent "Yes."' if real else 'agent "OK, thanks."', after="9s"),
    ]
    return lines


lines = main_tape() if video == "main" else metamask_tape()
take = os.path.join(here, "out", video)
os.makedirs(take, exist_ok=True)
path = os.path.join(take, "take.tape")
with open(path, "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"{video} {mode} tape written to {path}")
