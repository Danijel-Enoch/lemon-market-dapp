#!/usr/bin/env bash
#
# Drop the indexer's tables so the next start reindexes from `startBlock`.
#
# Safe by construction: Ponder owns the `ponder` schema and nothing else lives
# there, so this cannot reach Prisma's tables in `public`. Needed whenever the
# chain underneath changes — a fresh fork, a new deployment — because vault
# addresses repeat across deployments and Ponder would otherwise insert a
# primary key it already has.
#
# All chains at once. The schema holds every chain's rows in one set of tables
# keyed by (chainId, address), so there is no per-chain drop — resetting to add
# or repoint one chain replays all of them.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

CONTAINER="${POSTGRES_CONTAINER:-lemon-markets-app-postgres-1}"
docker exec "$CONTAINER" psql -U "${POSTGRES_USER:-lemon}" -d "${POSTGRES_DB:-lemon}" \
	-c 'DROP SCHEMA IF EXISTS ponder CASCADE;' >/dev/null
rm -rf apps/indexer/.ponder
echo "indexer reset — the next start will reindex every configured chain from its VAULT_FACTORY_START_BLOCK_<CHAIN>"
