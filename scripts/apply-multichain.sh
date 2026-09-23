#!/usr/bin/env bash
#
# Apply the multi-chain schema change to a database that predates it.
#
# The deploy cannot do this itself, and that is deliberate. `prisma db push`
# refuses the change unattended:
#
#   ⚠️  There might be data loss when applying the changes:
#   • The primary key for the `VaultConfig` table will be changed.
#   • A unique constraint covering [chainId,vaultAddress,ticker] on the table
#     `VaultMarket` will be added.
#   Error: Use the --accept-data-loss flag ...
#
# — so the `migrate` service exits 1 and the release is blocked. That is the
# correct outcome: a primary-key swap on the table that says which agent wallet
# custodies which vault is not something to let a pipeline infer at 3am. It is
# also not something to fix by adding `--accept-data-loss` to the deploy, which
# would hand that judgement to push permanently.
#
# So it is applied once, by hand, with this script: it checks whether the change
# is already in, takes a backup, runs the statements in one transaction, and
# verifies the result before saying so. Afterwards `db push` is additive again
# and the deploy goes green.
#
# Usage, on the host running the database:
#
#   scripts/apply-multichain.sh                       # uses $DATABASE_URL
#   scripts/apply-multichain.sh postgresql://user:pw@host:5432/lemon
#   CONTAINER=lemon-…-postgres-1 scripts/apply-multichain.sh   # via docker exec
#
# Stop the agents first. The vault rows are repointed at a new primary key, and
# a tick landing halfway through would write against the old one.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SQL="$ROOT/packages/db/prisma/multichain.sql"
DB_URL="${1:-${DATABASE_URL:-}}"
CONTAINER="${CONTAINER:-}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$SQL" ]] || die "$SQL not found — run this from a checkout of the repo."

# Two ways in, because the database on a compose host is usually not published:
# a URL when it is reachable, and `docker exec` into the postgres container when
# it is not. Everything below goes through these two wrappers so the rest of the
# script does not care which it was.
if [[ -n "$CONTAINER" ]]; then
	command -v docker >/dev/null 2>&1 || die "docker not found, but CONTAINER is set"
	PG_USER="${POSTGRES_USER:-lemon}"
	PG_DB="${POSTGRES_DB:-lemon}"
	info "using docker exec into $CONTAINER (user $PG_USER, database $PG_DB)"
	# No `-i` here. These are queries, not pipes, and `docker exec -i` attaches
	# stdin — which swallows the operator's typed confirmation before `read` can
	# see it, so the script aborts on its own prompt.
	psql_q()  { docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1"; }
	psql_f()  { docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -f -; }
	pg_dump_all() { docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB"; }
else
	[[ -n "$DB_URL" ]] || die "No database. Pass a URL, set DATABASE_URL, or set CONTAINER."
	command -v psql >/dev/null 2>&1 || die "psql not found. Set CONTAINER to go through docker instead."
	psql_q()  { psql "$DB_URL" -tAc "$1"; }
	psql_f()  { psql "$DB_URL" -v ON_ERROR_STOP=1 -f -; }
	pg_dump_all() { pg_dump "$DB_URL"; }
fi

bold "Multi-chain schema change"
echo

# --- is it already in? ------------------------------------------------------
#
# Checked first and by name, so running this twice is a no-op rather than a
# half-applied mess. `multichain.sql` drops constraints it then recreates, so a
# second run would fail partway with the table's keys already gone.

APPLIED="$(psql_q "select count(*) from information_schema.columns where table_schema='public' and column_name='chainId'" 2>/dev/null || true)"
[[ -n "$APPLIED" ]] || die "could not query the database — check the URL or the container name"

if [[ "$APPLIED" -ge 5 ]]; then
	bold "Already applied"
	echo "  $APPLIED chainId columns are present. Nothing to do; redeploy and the"
	echo "  migrate step will push the remaining additive changes itself."
	exit 0
fi

if [[ "$APPLIED" -ne 0 ]]; then
	# Neither state: some tables carry the column and some do not, which no run of
	# this file produces. Stopping is the only safe answer.
	die "$APPLIED of 5 chainId columns exist — the schema is half-migrated. Stop and inspect it by hand."
fi

VAULTS="$(psql_q "select count(*) from \"VaultConfig\"" 2>/dev/null || echo "?")"
RUNS="$(psql_q "select count(*) from \"AgentRun\"" 2>/dev/null || echo "?")"

cat <<-SUMMARY
	  The database has no chainId columns, so this is the pre-multichain schema.

	  rows        VaultConfig $VAULTS, AgentRun $RUNS
	  changes     every table that names a vault gains chainId, defaulted to 8453
	              VaultConfig's primary key becomes (chainId, address)
	              the indexes and foreign keys around it are recreated

	  Nothing is dropped that is not immediately recreated, and every new column
	  arrives as Base — which is what every existing row already was.

	  The agents must not be running. Vault rows are repointed at a new primary
	  key, and a tick landing halfway through would write against the old one.
SUMMARY
echo

printf "Type 'apply' to continue: "
read -r CONFIRM
[[ "$CONFIRM" == "apply" ]] || die "aborted, nothing was changed"

# --- backup -----------------------------------------------------------------

BACKUP="$ROOT/multichain-backup-$(date +%Y%m%d%H%M%S).sql"
info "backing up to $BACKUP"
pg_dump_all > "$BACKUP" || die "the backup failed — nothing was changed"
[[ -s "$BACKUP" ]] || die "the backup is empty — nothing was changed"
info "backup is $(wc -c < "$BACKUP" | tr -d ' ') bytes"

# --- apply ------------------------------------------------------------------
#
# The file wraps itself in BEGIN/COMMIT, and ON_ERROR_STOP turns any failure
# into a rollback rather than a partial apply.

info "applying"
psql_f < "$SQL" > /dev/null || die "the change failed and was rolled back. The backup is at $BACKUP"

# --- verify -----------------------------------------------------------------

AFTER="$(psql_q "select count(*) from information_schema.columns where table_schema='public' and column_name='chainId'")"
[[ "$AFTER" -ge 5 ]] || die "applied, but only $AFTER chainId columns are present. Inspect before deploying. Backup: $BACKUP"

ON_BASE="$(psql_q "select count(*) from \"VaultConfig\" where \"chainId\" = 8453")"

echo
bold "Done"
cat <<-NEXT
	  $AFTER chainId columns present
	  $ON_BASE of $VAULTS vault rows on Base (8453), as they always were
	  backup at $BACKUP

	Redeploy. The migrate step runs prisma db push, which now has only
	additive changes left and will exit clean.
NEXT
