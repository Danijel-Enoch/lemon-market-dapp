#!/usr/bin/env bash
# Stop the anvil started by fork-up.sh and forget its addresses.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .fork/anvil.pid ]]; then
	PID="$(cat .fork/anvil.pid)"
	kill "$PID" 2>/dev/null && echo "stopped anvil (${PID})" || echo "anvil (${PID}) was not running"
	rm -f .fork/anvil.pid
else
	echo "no .fork/anvil.pid; nothing to stop"
fi

# .env.fork is left in place deliberately: the addresses in it are the only
# record of what the last run deployed, and a stopped fork is often restarted.
