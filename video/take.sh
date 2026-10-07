#!/usr/bin/env bash
# One command per take.
#   ./take.sh main rehearsal        read-only commands, nothing is sent (safe to repeat)
#   ./take.sh main real             signals + guard refusal + a REAL $20 order + a REAL close on Monad testnet
#   ./take.sh metamask rehearsal    wallet reads, dry-run deposit, a read-only agent (order/close denied)
#   ./take.sh metamask real         a REAL deposit and re-enroll, then the agent places and closes a REAL $20 order
set -euo pipefail
cd "$(dirname "$0")"
video="${1:-main}"
mode="${2:-rehearsal}"
export TAKE_DIR="$(pwd)/out/$video"
export PERPL_CHAIN_ID=10143

if [[ "$video" == "main" && "$mode" == "real" && -z "${NANSEN_API_KEY:-}" ]]; then
  read -r -s -p "Paste your Nansen API key (hidden), then Enter: " NANSEN_API_KEY; echo
  [[ -n "$NANSEN_API_KEY" ]] || { echo "No key entered." >&2; exit 1; }
  [[ "$NANSEN_API_KEY" == nsn_* ]] || { echo "That doesn't look like a Nansen key (it should start with nsn_)." >&2; exit 1; }
  echo "Nansen key received (${#NANSEN_API_KEY} characters, starts with nsn_)."
  export NANSEN_API_KEY
fi
mm perpl guard --reset >/dev/null
positions=$(mm perpl positions --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["totals"]["count"])')
if [[ "$positions" != "0" ]]; then
  echo "The agent account has $positions open position(s); close them first (mm perpl close --market …)." >&2; exit 1
fi

python3 make_tape.py "$video" "$mode"
node record.mjs
if [[ "$video" == "main" ]]; then .venv/bin/python compose.py; name=demo-main; else .venv/bin/python compose_metamask.py; name=demo-metamask; fi
echo
echo "Video: $(pwd)/out/$name.mp4"
echo "Subtitles: $(pwd)/out/$name.srt"
