#!/usr/bin/env bash
#
# Run the stack against one environment.
#
# Every service already reads `.env` on its own, so the only thing this adds is
# an *overlay*: a second file whose values win. Shell variables take precedence
# over `--env-file` in Bun, so exporting the overlay here is enough to run the
# stack against a second set of addresses without editing `.env` — which
# matters, because `.env` holds the mainnet addresses this app deploys against
# and a half-reverted edit to it is how a run ends up pointed somewhere else.
#
# Usage:
#   scripts/dev.sh                    # .env alone
#   scripts/dev.sh .env.local         # .env with .env.local on top
#   scripts/dev.sh .env.local web api # only some services

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OVERLAY=""
if [[ $# -gt 0 && -f "$1" ]]; then
	OVERLAY="$1"; shift
fi

SERVICES=("$@")
[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=(api indexer web)

set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
if [[ -n "$OVERLAY" ]]; then
	# shellcheck disable=SC1090
	source "$OVERLAY"
	echo "==> overlay: $OVERLAY"
fi
set +a

echo "==> chain ${CHAIN_ID:-8453} via ${BASE_RPC_URL:-default}"
echo "==> factory ${VAULT_FACTORY_ADDRESS:-<unset>}"
echo "==> services: ${SERVICES[*]}"
echo

PIDS=()
# Kill the whole process group on the way out. Ponder and the React Router dev
# server both fork children, and killing only the parent leaves those holding
# their ports — which then makes the next run fail on a port that looks taken by
# nothing.
cleanup() {
	trap - INT TERM EXIT
	for pid in "${PIDS[@]:-}"; do
		kill -- "-${pid}" 2>/dev/null || kill "$pid" 2>/dev/null || true
	done
}
trap cleanup INT TERM EXIT

for svc in "${SERVICES[@]}"; do
	case "$svc" in
		api)     (set -m; exec bun run --filter '@lemon/api' dev) & ;;
		web)     (set -m; exec bun run --filter '@lemon/web' dev) & ;;
		admin)   (set -m; exec bun run --filter '@lemon/admin' dev) & ;;
		agent)   (set -m; exec bun run --filter '@lemon/agent' dev) & ;;
		# The indexer's own script pins PORT; see the note in ponder.config.ts.
		indexer) (set -m; exec bun run --filter '@lemon/indexer' dev) & ;;
		*) echo "unknown service: $svc" >&2; exit 1 ;;
	esac
	PIDS+=("$!")
done

wait
