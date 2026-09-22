#!/usr/bin/env bash
#
# Put Lemon on X Layer, end to end.
#
# Deploying the contracts is the short half. The long half is that five
# processes — the web app, the admin console, the API, the indexer and the agent
# — each have to be told, separately, that X Layer now exists and where it is;
# and every one of them fails *quietly* when it is not. A missing factory
# address is a chain that simply never appears in the network switcher. A
# missing start block is an indexer reading X Layer from genesis, which looks
# like a hang. An agent still pinned to Base skips every X Layer vault it sees
# and logs nothing but "0 vaults". None of those is an error anyone gets paged
# for; all of them look like "the feature isn't working yet".
#
# So this script runs the deploy and then walks the wiring, writes what is
# missing, prints what each service now reads, and tells you what to restart.
#
#   scripts/deploy-xlayer.sh                  # deploy + wire, writing to .env
#   scripts/deploy-xlayer.sh .env.local       # write there instead
#   WIRE_ONLY=1 scripts/deploy-xlayer.sh      # X Layer is already deployed; just wire it
#   VERIFY_ONLY=1 scripts/deploy-xlayer.sh    # re-verify the contracts on OKLink
#
# The deploy itself is `scripts/deploy-contracts.sh`, unchanged and shared with
# Base and Arbitrum — this does not duplicate it. What is here is what is true
# of X Layer and of nothing else: gas is OKB, verification is OKLink rather than
# Etherscan, spot routes through LI.FI rather than KyberSwap, and the USDC is a
# bridged token with a convincing impostor on the same chain.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env}"
WIRE_ONLY="${WIRE_ONLY:-0}"
VERIFY_ONLY="${VERIFY_ONLY:-0}"

# Foundry binds `--chain` to the `CHAIN` environment variable, and there is no
# foundry chain called "xlayer" — so a `CHAIN` left exported in the calling
# shell makes every `cast call` below fail with `invalid value 'xlayer' for
# '--chain'`, which reads as a problem with the contract being called. The
# handoff to deploy-contracts.sh below passes CHAIN deliberately, as a prefix
# assignment on that one command, and that script unsets it the same way.
unset CHAIN

# Kept in step with the X Layer entry of `CHAIN_REGISTRY` in
# packages/core/src/chain.ts by hand, for the same reason deploy-contracts.sh
# duplicates it: bash cannot read a TypeScript module, and a deploy script that
# only runs after `bun install` has is worse than a duplicated constant.
CHAIN_ID=196
SUFFIX=XLAYER
CHAIN_NAME="X Layer"
GAS_SYMBOL=OKB
DEFAULT_RPC="https://rpc.xlayer.tech"
DEFAULT_USDC="0xB6CEceAB302E2E4948951eE7843FC24E92933061"
EXPLORER="https://www.oklink.com/xlayer"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '==> %s\n' "$*"; }
step() { printf '\n\033[1m-- %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------

for bin in forge cast jq curl; do
	command -v "$bin" >/dev/null 2>&1 || die "$bin not found. Foundry: https://getfoundry.sh"
done

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.example to .env first."
[[ -x scripts/deploy-contracts.sh ]] || die "scripts/deploy-contracts.sh is missing or not executable"

# Read values out of the env file rather than sourcing it: sourcing would pull
# every other secret in there into this process for no reason.
env_get() {
	sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -n1 | sed 's/^["'\'']//; s/["'\'']$//'
}

# Replace in place if the key is there, append if it is not. Same awk as
# deploy-contracts.sh, because the two write to the same file and a second
# dialect of "set a variable" is how one of them starts appending duplicates.
set_env() {
	local key="$1" value="$2" tmp
	tmp="$(mktemp)"
	KEY="$key" VALUE="$value" awk '
		BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; done = 0 }
		$0 ~ "^[[:space:]]*" key "=" && !done { print key "=" value; done = 1; next }
		{ print }
		END { if (!done) print key "=" value }
	' "$ENV_FILE" > "$tmp"
	mv "$tmp" "$ENV_FILE"
}

BACKED_UP=0
BACKUP=""
# One backup for this script's own writes, taken lazily so a run that changes
# nothing does not litter the directory with copies.
backup_once() {
	[[ "$BACKED_UP" == "1" ]] && return 0
	BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
	cp "$ENV_FILE" "$BACKUP"
	BACKED_UP=1
}

# Write only when the value would change. The report line is the point: a run
# that touches nothing should say so rather than look identical to one that
# rewrote half the file.
ensure_env() {
	local key="$1" value="$2" current
	current="$(env_get "$key")"
	if [[ "$current" == "$value" ]]; then
		printf '    %-34s already %s\n' "$key" "$value"
		return 0
	fi
	backup_once
	set_env "$key" "$value"
	if [[ -z "$current" ]]; then
		printf '    %-34s set to %s\n' "$key" "$value"
	else
		printf '    %-34s %s -> %s\n' "$key" "$current" "$value"
	fi
}

prompt_value() {
	local var="$1" label="$2" default="${3:-}" value
	if [[ -n "$default" ]]; then
		printf '%s [%s]: ' "$label" "$default" >&2
	else
		printf '%s: ' "$label" >&2
	fi
	read -r value
	printf -v "$var" '%s' "${value:-$default}"
}

is_address() { [[ "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# --- what is different about this chain -------------------------------------

bold "Lemon on $CHAIN_NAME (chain $CHAIN_ID)"
cat <<-BRIEF

	  Four things are true here and nowhere else in this repo:

	  gas         $GAS_SYMBOL, not ETH. A deployer funded with bridged ETH cannot send
	              a transaction on this chain at all.
	  explorer    OKLink. Etherscan v2 does not index X Layer, so verification
	              needs an OKLink key — a Basescan key will be rejected.
	  spot        LI.FI, not KyberSwap, which has no X Layer deployment. Nine of
	              the fourteen markets quote through USDG rather than a direct
	              USDC pair, so LIFI_API_KEY is close to required in practice.
	  asset       Bridged USDC. This chain also carries a second contract
	              answering symbol() "USDC" with six decimals which is NOT it.
	              The deploy refuses to guess; it reads the token and shows you.
BRIEF

if [[ -z "$(env_get LIFI_API_KEY)" ]]; then
	echo
	# Not fatal — the unauthenticated tier works — but it is tight, and this app
	# is a heavy user of it: a routability sweep is two calls per token and a
	# quote that has to try the USDG hop is three. Exhausting it returns a 429
	# saying "retry in 2 hours", and reached mid-deploy that is a vault position
	# with one leg on.
	warn "LIFI_API_KEY is unset. X Layer's spot leg routes through LI.FI, and its"
	warn "free tier 429s for two hours at a time — which mid-trade is one leg on."
fi

# --- the deploy -------------------------------------------------------------

if [[ "$WIRE_ONLY" == "1" ]]; then
	step "Skipping the deploy (WIRE_ONLY=1) — wiring what is already in $ENV_FILE"
else
	step "Deploying the contracts"
	info "handing off to scripts/deploy-contracts.sh with CHAIN=xlayer"
	echo
	# The shared script owns everything that is not X Layer-specific: the key
	# prompts, the chain-id check, the six-decimal assertion, the simulation, the
	# confirmation, the broadcast, the OKLink verification and the first pass of
	# env writes. Re-implementing any of it here would mean two deploy paths that
	# have to agree about what is safe.
	CHAIN=xlayer VERIFY_ONLY="$VERIFY_ONLY" scripts/deploy-contracts.sh "$ENV_FILE"

	if [[ "$VERIFY_ONLY" == "1" ]]; then
		echo
		bold "Verified. Nothing else changed — re-run without VERIFY_ONLY to wire the services."
		exit 0
	fi
fi

# --- what is on chain now ---------------------------------------------------

FACTORY="$(env_get "VAULT_FACTORY_ADDRESS_$SUFFIX")"
FUND="$(env_get "INSURANCE_FUND_ADDRESS_$SUFFIX")"
START_BLOCK="$(env_get "VAULT_FACTORY_START_BLOCK_$SUFFIX")"
ASSET="$(env_get "USDC_ADDRESS_$SUFFIX")"; ASSET="${ASSET:-$DEFAULT_USDC}"
RPC_URL="$(env_get "RPC_URL_$SUFFIX")"; RPC_URL="${RPC_URL:-$DEFAULT_RPC}"

is_address "$FACTORY" \
	|| die "VAULT_FACTORY_ADDRESS_$SUFFIX is not set in $ENV_FILE. Run without WIRE_ONLY=1 to deploy."

step "Checking the deployment against the chain"

# Re-read rather than trust the file. A factory address written by a run pointed
# at the wrong RPC is exactly the failure the rest of this script would then
# propagate into five services, and `cast` costs one round trip to rule out.
CHAIN_ID_SEEN="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)" || die "cannot reach $RPC_URL"
[[ "$CHAIN_ID_SEEN" == "$CHAIN_ID" ]] \
	|| die "$RPC_URL is chain $CHAIN_ID_SEEN, not $CHAIN_NAME ($CHAIN_ID). Fix RPC_URL_$SUFFIX first."

CODE="$(cast code "$FACTORY" --rpc-url "$RPC_URL" 2>/dev/null || true)"
[[ -n "$CODE" && "$CODE" != "0x" ]] \
	|| die "no contract at $FACTORY on $CHAIN_NAME — that address is from another chain or another run"

# The asset is immutable on the factory. If it disagrees with what the env file
# says, every balance the app formats is about a different token than the one
# the vaults hold, and nothing errors.
# stderr kept, not discarded: when this fails it is usually the node or a flag,
# and "that is not a VaultFactory" is a confident wrong answer to both.
FACTORY_ASSET="$(cast call "$FACTORY" 'asset()(address)' --rpc-url "$RPC_URL" 2>&1 | awk '{print $1}')" \
	|| die "$FACTORY does not answer asset(): $FACTORY_ASSET"
# `${x,,}` would be shorter and needs bash 4; macOS ships 3.2 as /bin/bash.
if [[ "$(lower "$FACTORY_ASSET")" != "$(lower "$ASSET")" ]]; then
	warn "the factory's asset is $FACTORY_ASSET, but USDC_ADDRESS_$SUFFIX says $ASSET"
	warn "the factory's copy is the immutable one; taking it."
	ASSET="$FACTORY_ASSET"
fi

ASSET_SYMBOL="$(cast call "$ASSET" 'symbol()(string)' --rpc-url "$RPC_URL" 2>/dev/null | tr -d '"' || echo '?')"
VAULT_COUNT="$(cast call "$FACTORY" 'vaultCount()(uint256)' --rpc-url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo '?')"

info "factory        $FACTORY  ($VAULT_COUNT vaults)"
info "insurance      ${FUND:-unknown}"
info "asset          $ASSET  ($ASSET_SYMBOL)"
info "start block    ${START_BLOCK:-unset}"
info "rpc            $RPC_URL"

if [[ -z "$START_BLOCK" || "$START_BLOCK" == "0" ]]; then
	# Worth interrupting for. X Layer is past 20M blocks; a backfill from genesis
	# is hours of RPC finding nothing, and it presents as a stuck indexer rather
	# than as a missing variable.
	warn "VAULT_FACTORY_START_BLOCK_$SUFFIX is unset — the indexer would read this chain"
	warn "from genesis, which is hours of RPC for nothing and looks like a hang."
	BLOCK_GUESS="$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || true)"
	prompt_value START_BLOCK "Block the factory was deployed in" "${BLOCK_GUESS:-}"
	[[ "$START_BLOCK" =~ ^[0-9]+$ ]] || die "that is not a block number"
fi

# --- wiring -----------------------------------------------------------------
#
# Every variable below is one a *different* process reads. They are written here
# rather than left to the operator because they have to agree with each other,
# and the way they fail when they do not is silence.

step "Wiring the services"

echo "  server side — API, agent, admin, seed (packages/core, apps/api, apps/agent)"
ensure_env "VAULT_FACTORY_ADDRESS_$SUFFIX" "$FACTORY"
[[ -n "$FUND" ]] && ensure_env "INSURANCE_FUND_ADDRESS_$SUFFIX" "$FUND"
ensure_env "USDC_ADDRESS_$SUFFIX" "$ASSET"
ensure_env "RPC_URL_$SUFFIX" "$RPC_URL"

echo
echo "  browser — the network switcher offers exactly the chains with a factory here"
# VITE_ values are read at build time from the bundle, not from the server's
# environment, which is why the factory address is duplicated rather than
# shared. The two disagreeing is the failure this pair exists to prevent.
ensure_env "VITE_VAULT_FACTORY_ADDRESS_$SUFFIX" "$FACTORY"
ensure_env "VITE_RPC_URL_$SUFFIX" "$RPC_URL"

echo
echo "  indexer — apps/indexer (Ponder)"
ensure_env "VAULT_FACTORY_START_BLOCK_$SUFFIX" "$START_BLOCK"
# `PONDER_RPC_URL_<CHAIN>` *replaces* the shared endpoint rather than adding to
# it, so it is only seeded when empty — an operator who has bought a dedicated
# backfill endpoint should not have it silently reset to the app's node. Comma
# separated: Ponder measures each URL's real rate limit and splits the backfill
# across them, and one public node is a backfill throttled to a few requests a
# second with nothing to fail over to.
if [[ -z "$(env_get "PONDER_RPC_URL_$SUFFIX")" ]]; then
	ensure_env "PONDER_RPC_URL_$SUFFIX" "$RPC_URL"
	warn "PONDER_RPC_URL_$SUFFIX now points at the same node as the app. Give the"
	warn "indexer its own keyed endpoints, comma separated, before a real backfill."
else
	printf '    %-34s kept (%s)\n' "PONDER_RPC_URL_$SUFFIX" "$(env_get "PONDER_RPC_URL_$SUFFIX")"
fi

echo
echo "  agent — one process per chain, apps/agent"
# Not written unconditionally. `AGENT_CHAIN_ID` selects the single chain a
# process serves; flipping the shared value to 196 would take the Base agent off
# Base vaults entirely, which is not something to do as a side effect of a
# deploy. In production this is a second container, not a changed variable.
AGENT_CHAIN_CURRENT="$(env_get AGENT_CHAIN_ID)"
printf '    %-34s %s\n' "AGENT_CHAIN_ID (this file)" "${AGENT_CHAIN_CURRENT:-8453 (default, Base)}"
if [[ "$AGENT_CHAIN_CURRENT" != "$CHAIN_ID" ]]; then
	echo "    A vault on $CHAIN_NAME is only traded by an agent started with"
	echo "    AGENT_CHAIN_ID=$CHAIN_ID. An agent on another chain skips it silently."
	prompt_value POINT_AGENT "Point the agent in $ENV_FILE at $CHAIN_NAME? (yes/no)" "no"
	if [[ "$POINT_AGENT" == "yes" ]]; then
		ensure_env AGENT_CHAIN_ID "$CHAIN_ID"
		warn "this process now serves $CHAIN_NAME only — Base vaults are no longer ticked"
	fi
fi

[[ "$BACKED_UP" == "1" ]] && info "previous $ENV_FILE saved as $BACKUP"

# --- artifacts --------------------------------------------------------------

if command -v bun >/dev/null 2>&1; then
	step "Regenerating the TypeScript ABIs"
	# packages/contracts/ts/abi.ts is generated from the forge artifacts and is
	# what every app imports. A deploy that skips this leaves the apps on the ABI
	# of whatever was last built.
	bun run contracts:build >/dev/null 2>&1 \
		&& info "packages/contracts/ts/abi.ts rebuilt" \
		|| warn "bun run contracts:build failed — run it by hand before starting anything"
else
	warn "bun not found; run 'bun run contracts:build' before starting the apps"
fi

# --- the indexer's existing rows --------------------------------------------

step "Indexer"
cat <<-INDEXER
	  Adding a chain changes Ponder's config, and it re-syncs from each chain's
	  start block on the next start. That is usually all you need.

	  A reset is for when the rows are wrong rather than incomplete: a redeployed
	  factory on a chain already indexed, because vault addresses repeat across
	  deployments and Ponder would insert a primary key it already holds. It
	  replays every chain, not just this one.
INDEXER
echo
prompt_value RESET_INDEXER "Drop the indexer schema and reindex? (yes/no)" "no"
if [[ "$RESET_INDEXER" == "yes" ]]; then
	scripts/indexer-reset.sh || warn "indexer reset failed — is Postgres running?"
fi

# --- what to do next --------------------------------------------------------

echo
bold "$CHAIN_NAME is wired"
cat <<-NEXT

	  factory   $EXPLORER/address/$FACTORY
	  fund      $EXPLORER/address/${FUND:-}

	  Each of these reads the values above at *start*, so they need a restart —
	  and the browser needs a rebuild, because VITE_ values are baked into the
	  bundle rather than read from the server.

	    bun run build:web && bun run build:admin   # bundles the new chain in
	    bun run dev:indexer                        # backfills from $START_BLOCK
	    bun run dev:api                            # serves X Layer reads
	    AGENT_CHAIN_ID=$CHAIN_ID bun run dev:agent           # a process of its own

	  Under compose, the agent is a second service rather than a changed
	  variable, because one process serves one chain:

	    COMPOSE_PROFILES=xlayer docker compose -f docker-compose.dokploy.yml up -d

	  Then, in order:

	    1. Admin console -> Create vault, with $CHAIN_NAME selected. The factory
	       is what makes the chain appear there at all; it is offered now.
	    2. bun run seed:venues   # only for vaults created outside that flow
	    3. Fund the deployer's agent wallets with $GAS_SYMBOL. The vault holds USDC and
	       may never hold gas, so an agent with no $GAS_SYMBOL cannot report NAV or
	       fulfil a redemption — and that failure is silent until someone waits.

	  Re-runnable at any time, and it will not redeploy:

	    WIRE_ONLY=1 scripts/deploy-xlayer.sh $ENV_FILE
NEXT
