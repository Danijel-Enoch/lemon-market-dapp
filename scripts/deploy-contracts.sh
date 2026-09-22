#!/usr/bin/env bash
#
# Deploy InsuranceFund + VaultFactory to one chain and verify them on its explorer.
#
# Paste a private key and an Etherscan API key when asked; everything else has a
# working default. The script simulates first, shows you what it is about to do
# and what it will cost, and only then asks for confirmation — because this is
# mainnet and the deploy is not reversible.
#
# Afterwards it writes the deployed addresses and the start block back into your
# env file, since four separate variables have to agree for the app, the admin
# dashboard and the indexer to point at the same deployment, and setting them by
# hand is how one of them ends up wrong.
#
# Neither key is written to disk or to your shell history. The private key does
# appear in this process's argv while forge runs — foundry has no environment
# variable for it — so on a shared machine prefer a keystore account and
# `forge script --account` by hand.
#
# One chain per run. The contracts are identical on each, but the addresses, the
# start block and the asset are not — so each chain gets its own deploy, its own
# `_<CHAIN>`-suffixed variables, and its own confirmation of what it is about to
# do. CHAIN accepts base (the default), arbitrum or xlayer.
#
# Usage:
#   scripts/deploy-contracts.sh                       # deploy to Base, write to .env
#   CHAIN=arbitrum scripts/deploy-contracts.sh        # deploy to Arbitrum One
#   CHAIN=xlayer scripts/deploy-contracts.sh .env.local
#   VERIFY_ONLY=1 CHAIN=arbitrum scripts/deploy-contracts.sh   # re-verify, no key needed

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTRACTS="$ROOT/packages/contracts"
ENV_FILE="${1:-.env}"
VERIFY_ONLY="${VERIFY_ONLY:-0}"
# --- which chain ------------------------------------------------------------
#
# Kept in step with `CHAIN_REGISTRY` in packages/core/src/chain.ts by hand. There
# is no way to read that from bash without a bun process, and a deploy script
# that cannot run before `bun install` has is worse than a duplicated table.
#
# `ASSET_VERIFIED` is the one column that is not cosmetic. It records whether the
# USDC address below was read off the chain it names or taken from a list — and
# an unverified default forces the operator to confirm the token explicitly
# rather than accept whatever this file happens to say.
#
# `VERIFIER_FLAGS` is empty for the Etherscan chains, and every expansion of it
# is guarded `${VERIFIER_FLAGS[@]+"..."}`. Not style: `set -u` on bash 3.2 —
# which is what macOS ships and what `env bash` finds — treats an unguarded
# empty array as an unbound variable and exits, so a Base deploy would abort at
# the broadcast line on the machine most likely to be running it.

# Read once, then removed from the environment — this is not tidiness.
#
# Foundry binds `--chain` to the `CHAIN` environment variable, so `CHAIN=xlayer
# scripts/deploy-contracts.sh` hands every `cast` and `forge` in this file a
# `--chain xlayer` it did not ask for, and foundry has no chain by that name.
# What comes back is
#
#   error: invalid value 'xlayer' for '--chain <CHAIN>'
#
# from whichever call is first to have the flag — `cast call`, reading the
# asset's symbol() — which reads as a problem with the token rather than with a
# variable this script set. `cast chain-id`, `cast code` and `cast balance` have
# no such flag and pass, so the run gets far enough to look healthy first.
#
# `base` and `arbitrum` happen to be real foundry chain names, which is why this
# only ever surfaced on X Layer.
CHAIN_KEY="${CHAIN:-base}"
unset CHAIN

case "$CHAIN_KEY" in
	base)
		CHAIN_NAME="Base"
		ENV_SUFFIX="BASE"
		EXPECTED_CHAIN_ID=8453
		DEFAULT_RPC="https://mainnet.base.org"
		DEFAULT_ASSET="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
		ASSET_VERIFIED=1
		EXPLORER="https://basescan.org"
		VERIFIER="etherscan"
		VERIFIER_FLAGS=()
		;;
	arbitrum)
		CHAIN_NAME="Arbitrum One"
		ENV_SUFFIX="ARBITRUM"
		EXPECTED_CHAIN_ID=42161
		DEFAULT_RPC="https://arb1.arbitrum.io/rpc"
		# Circle-issued native USDC, confirmed against the chain. NOT the bridged
		# USDC.e at 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8, which also answers
		# symbol() "USDC" with six decimals and holds a fiftieth of the supply.
		# Changing this address is not a cosmetic edit.
		DEFAULT_ASSET="0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
		ASSET_VERIFIED=1
		EXPLORER="https://arbiscan.io"
		VERIFIER="etherscan"
		VERIFIER_FLAGS=()
		;;
	xlayer)
		CHAIN_NAME="X Layer"
		ENV_SUFFIX="XLAYER"
		EXPECTED_CHAIN_ID=196
		DEFAULT_RPC="https://rpc.xlayer.tech"
		# Bridged; there is no Circle-native issuance on X Layer. Confirmed against
		# the chain — and note that X Layer carries a second contract answering
		# symbol() = "USDC" with six decimals which is NOT this one and holds a
		# fraction of the supply. Changing this address is not a cosmetic edit.
		DEFAULT_ASSET="0xB6CEceAB302E2E4948951eE7843FC24E92933061"
		ASSET_VERIFIED=1
		EXPLORER="https://www.oklink.com/xlayer"
		# X Layer is on OKLink, not Etherscan. Etherscan v2 does not index it, so
		# `--verifier etherscan` would fail after the gas is already spent.
		VERIFIER="oklink"
		VERIFIER_FLAGS=(--verifier-url "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/xlayer")
		;;
	*)
		printf '\033[31mxx  unknown CHAIN "%s". Use base, arbitrum or xlayer.\033[0m\n' "$CHAIN_KEY" >&2
		exit 1
		;;
esac

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------

for bin in forge cast jq curl; do
	command -v "$bin" >/dev/null 2>&1 || die "$bin not found. Foundry: https://getfoundry.sh"
done

# forge-std is a pinned submodule, not an npm package. A fresh clone has the
# directory but nothing in it, and forge's error for that is not obvious.
if [[ ! -f "$CONTRACTS/lib/forge-std/src/Script.sol" ]]; then
	info "forge-std submodule missing — initialising"
	git -C "$ROOT" submodule update --init --recursive
fi

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.example to .env first."

# Read defaults out of the env file rather than sourcing it: sourcing would pull
# every other secret in there into this process for no reason.
env_get() {
	sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -n1 | sed 's/^["'\'']//; s/["'\'']$//'
}

# Suffixed first, then the unsuffixed name for Base only. An `.env` written
# before there was more than one chain says `BASE_RPC_URL` and means Base; it
# must not become Arbitrum's default just because Arbitrum has no entry yet.
env_get_chain() {
	local value
	value="$(env_get "$1_$ENV_SUFFIX")"
	if [[ -z "$value" && "$ENV_SUFFIX" == "BASE" ]]; then value="$(env_get "$1")"; fi
	printf '%s' "$value"
}

RPC_DEFAULT="$(env_get_chain RPC_URL)"
[[ -z "$RPC_DEFAULT" && "$ENV_SUFFIX" == "BASE" ]] && RPC_DEFAULT="$(env_get BASE_RPC_URL)"
RPC_DEFAULT="${RPC_DEFAULT:-$DEFAULT_RPC}"

ADMIN_DEFAULT="$(env_get VAULT_ADMIN_ADDRESS)"
GUARDIAN_DEFAULT="$(env_get VAULT_GUARDIAN_ADDRESS)"
TREASURER_DEFAULT="$(env_get INSURANCE_TREASURER_ADDRESS)"
ASSET_DEFAULT="$(env_get_chain USDC_ADDRESS)"; ASSET_DEFAULT="${ASSET_DEFAULT:-$DEFAULT_ASSET}"

# --- input ------------------------------------------------------------------

prompt_secret() {
	local var="$1" label="$2" value
	printf '%s: ' "$label" >&2
	read -rs value
	printf '\n' >&2
	printf -v "$var" '%s' "$value"
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

if [[ "$VERIFY_ONLY" == "1" ]]; then
	bold "Re-verify the last Lemon deploy on $CHAIN_NAME"
else
	bold "Deploy the Lemon vault contracts to $CHAIN_NAME"
fi
echo

if [[ "$VERIFY_ONLY" != "1" ]]; then
	prompt_secret PRIVATE_KEY "Deployer private key (hidden, paste and press enter)"
	PRIVATE_KEY="${PRIVATE_KEY#0x}"
	[[ "$PRIVATE_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || die "that is not a 32-byte private key"
	PRIVATE_KEY="0x$PRIVATE_KEY"
fi

if [[ "$VERIFIER" == "etherscan" ]]; then
	prompt_secret ETHERSCAN_API_KEY "Etherscan API key (hidden — etherscan.io/myapikey, one key covers Basescan and Arbiscan)"
else
	prompt_secret ETHERSCAN_API_KEY "OKLink API key (hidden — oklink.com, used to verify on X Layer)"
fi
[[ -n "$ETHERSCAN_API_KEY" ]] || die "an API key is required; verification is the whole second half of this script"
export ETHERSCAN_API_KEY

prompt_value RPC_URL "$CHAIN_NAME RPC URL" "$RPC_DEFAULT"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)" || die "cannot reach $RPC_URL"
if [[ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
	# Not a warning to click past lightly: the addresses this run writes back into
	# the env file are labelled with CHAIN, and a mismatch here is how a factory
	# deployed on one chain ends up recorded as another's.
	#
	# It is also the single most common way to reach the confusing failure a few
	# steps down — "no contract at 0x… " for the asset — because these USDC
	# addresses exist on exactly one network each. Saying so here costs a line
	# and saves reading that one as a problem with the token.
	warn "that RPC is chain $CHAIN_ID, not $CHAIN_NAME ($EXPECTED_CHAIN_ID)"
	warn "continuing would deploy to chain $CHAIN_ID and record it as $CHAIN_NAME's, and"
	warn "$CHAIN_NAME's USDC does not exist on chain $CHAIN_ID — this run would stop there anyway"
	prompt_value CONFIRM_CHAIN "Continue anyway? (yes/no)" "no"
	[[ "$CONFIRM_CHAIN" == "yes" ]] || exit 1
fi

# Check the API key now rather than after the gas is spent. A bad key turns a
# successful deploy into an unverified one — fixable, but only noisily. Only
# Etherscan has an endpoint cheap enough to probe this way.
if [[ "$VERIFIER" == "etherscan" ]]; then
	KEY_STATUS="$(curl -fsS --max-time 20 \
		"https://api.etherscan.io/v2/api?chainid=$CHAIN_ID&module=stats&action=ethprice&apikey=$ETHERSCAN_API_KEY" \
		2>/dev/null | jq -r '.status // "0"')" || KEY_STATUS="0"
	[[ "$KEY_STATUS" == "1" ]] || warn "Etherscan rejected that API key. Continuing; verification will probably fail."
fi

RUN_JSON="$CONTRACTS/broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"

# --- build, simulate, confirm, broadcast ------------------------------------

if [[ "$VERIFY_ONLY" != "1" ]]; then
	DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
	info "deployer: $DEPLOYER"

	prompt_value VAULT_ADMIN_ADDRESS         "Vault admin (holds every role on every vault)" "${ADMIN_DEFAULT:-$DEPLOYER}"
	prompt_value VAULT_GUARDIAN_ADDRESS      "Guardian (can pause)"                          "${GUARDIAN_DEFAULT:-$DEPLOYER}"
	prompt_value INSURANCE_TREASURER_ADDRESS "Insurance treasurer (moves fund value)"        "${TREASURER_DEFAULT:-$DEPLOYER}"
	prompt_value VAULT_ASSET_ADDRESS         "Vault asset (USDC)"                            "$ASSET_DEFAULT"

	for pair in "admin:$VAULT_ADMIN_ADDRESS" "guardian:$VAULT_GUARDIAN_ADDRESS" \
	            "treasurer:$INSURANCE_TREASURER_ADDRESS" "asset:$VAULT_ASSET_ADDRESS"; do
		is_address "${pair#*:}" || die "${pair%%:*} is not an address: ${pair#*:}"
	done
	export VAULT_ADMIN_ADDRESS VAULT_GUARDIAN_ADDRESS INSURANCE_TREASURER_ADDRESS VAULT_ASSET_ADDRESS

	BALANCE_WEI="$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")"
	# X Layer charges gas in OKB, so "bridge some ETH" would send an operator
	# after the wrong asset entirely.
	GAS_SYMBOL="ETH"; [[ "$ENV_SUFFIX" == "XLAYER" ]] && GAS_SYMBOL="OKB"
	[[ "$BALANCE_WEI" != "0" ]] || die "$DEPLOYER holds no $GAS_SYMBOL on $CHAIN_NAME — bridge gas first"
	BALANCE_ETH="$(cast from-wei "$BALANCE_WEI")"

	# The asset is immutable on the factory, so a wrong one here means every
	# vault it ever makes is dead on arrival. The factory does not check.
	#
	# Three different failures land on this line and they are not fixed the same
	# way, so they are told apart rather than collapsed into one message. An
	# earlier version swallowed the RPC's own error with `2>/dev/null` and said
	# "that is not an ERC-20 on this chain" for all of them — which is a
	# confident, wrong diagnosis when the truth is a rate limit or an endpoint
	# pointed at the wrong network, and it sends the operator to check the token
	# address, which is the one thing that was right.
	ASSET_CODE="$(cast code "$VAULT_ASSET_ADDRESS" --rpc-url "$RPC_URL" 2>&1)" || {
		printf '%s\n' "$ASSET_CODE" >&2
		die "cannot read $VAULT_ASSET_ADDRESS from $RPC_URL — the error above is the node's, not this address's"
	}

	if [[ -z "$ASSET_CODE" || "$ASSET_CODE" == "0x" ]]; then
		# The common one, and the reason the chain-id warning earlier is worth
		# taking seriously: these token addresses exist on exactly one network.
		# On a testnet endpoint, or a mainnet endpoint for another chain, the
		# address is simply an empty account.
		die "no contract at $VAULT_ASSET_ADDRESS on the chain behind $RPC_URL (chain $CHAIN_ID).
    This address is $CHAIN_NAME mainnet's USDC and exists on no other network, so
    either that endpoint is a testnet or another chain, or the address is wrong.
    Point RPC_URL_$ENV_SUFFIX at $CHAIN_NAME ($EXPECTED_CHAIN_ID) and run again."
	fi

	ASSET_SYMBOL="$(cast call "$VAULT_ASSET_ADDRESS" 'symbol()(string)' --rpc-url "$RPC_URL" 2>&1 | tr -d '"')" \
		|| die "$VAULT_ASSET_ADDRESS has code on this chain but does not answer symbol(): $ASSET_SYMBOL"

	ASSET_DECIMALS="$(cast call "$VAULT_ASSET_ADDRESS" 'decimals()(uint8)' --rpc-url "$RPC_URL" 2>&1 | awk '{print $1}')" \
		|| die "$VAULT_ASSET_ADDRESS has code on this chain but does not answer decimals(): $ASSET_DECIMALS"

	# Six decimals is not a preference. Every amount in this system is stored and
	# formatted as 6dp USDC, so a token with 18 would have every balance in the
	# app wrong by a factor of 10^12 — and nothing would error, because the
	# arithmetic is all valid.
	[[ "$ASSET_DECIMALS" == "6" ]] \
		|| die "$VAULT_ASSET_ADDRESS reports $ASSET_DECIMALS decimals; this system assumes 6 everywhere. Refusing."

	# The gate that makes `ASSET_VERIFIED` mean something. On a chain whose USDC
	# address came from a list rather than from the chain, the operator has to
	# look at what the chain actually says before any of it is baked into an
	# immutable factory.
	if [[ "$ASSET_VERIFIED" != "1" && "$VAULT_ASSET_ADDRESS" == "$DEFAULT_ASSET" ]]; then
		echo
		warn "the default asset for $CHAIN_NAME has not been verified against the chain"
		cat <<-ASSET
			  The address below is this script's best guess, not something read off
			  $CHAIN_NAME and checked. It is immutable on the factory once deployed.

			    address   $VAULT_ASSET_ADDRESS
			    symbol()  $ASSET_SYMBOL
			    decimals() $ASSET_DECIMALS
			    explorer  $EXPLORER/address/$VAULT_ASSET_ADDRESS

			  Open that page and confirm it is the USDC you intend depositors to send.
		ASSET
		echo
		prompt_value CONFIRM_ASSET "Type the symbol above to confirm ($ASSET_SYMBOL)" ""
		[[ "$CONFIRM_ASSET" == "$ASSET_SYMBOL" ]] || die "asset not confirmed, nothing was sent"
	fi

	echo
	info "building"
	(cd "$CONTRACTS" && forge build) || die "the contracts do not compile — nothing was sent"

	# A dry run against real chain state. It costs nothing and catches the two
	# things that otherwise surface only after the first transaction: a revert in
	# the constructor arguments, and a balance that covers the gas for neither.
	info "simulating"
	(cd "$CONTRACTS" && forge script script/Deploy.s.sol:Deploy \
		--rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY") \
		|| die "the simulation failed — nothing was sent. The error above is what would have happened on-chain."

	echo
	bold "About to broadcast to $CHAIN_NAME (chain $CHAIN_ID)"
	cat <<-SUMMARY
		  chain        $CHAIN_NAME ($CHAIN_ID)
		  deployer     $DEPLOYER  ($BALANCE_ETH $GAS_SYMBOL)
		  admin        $VAULT_ADMIN_ADDRESS
		  guardian     $VAULT_GUARDIAN_ADDRESS
		  treasurer    $INSURANCE_TREASURER_ADDRESS
		  asset        $VAULT_ASSET_ADDRESS  ($ASSET_SYMBOL)
		  rpc          $RPC_URL
		  env file     $ENV_FILE

		The admin, guardian and asset are baked into the factory and cannot be
		changed afterwards. Every vault it creates inherits them.
	SUMMARY
	echo
	prompt_value CONFIRM "Type 'deploy' to broadcast" ""
	[[ "$CONFIRM" == "deploy" ]] || die "aborted, nothing was sent"

	STARTED_AT="$(date +%s)"
	echo
	info "broadcasting"
	# Not fatal on its own: forge exits non-zero when verification fails even
	# though the contracts are on-chain, and that case is recoverable below.
	(cd "$CONTRACTS" && forge script script/Deploy.s.sol:Deploy \
		--rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
		--broadcast --verify --verifier "$VERIFIER" ${VERIFIER_FLAGS[@]+"${VERIFIER_FLAGS[@]}"} --chain "$CHAIN_ID" --slow) \
		|| warn "forge exited non-zero — reading the broadcast log to see how far it got"

	[[ -f "$RUN_JSON" ]] || die "no broadcast record at $RUN_JSON; nothing was deployed"
	# Guard against reporting a *previous* deployment's addresses as this run's.
	# forge writes this in milliseconds; older versions wrote seconds.
	RUN_AT="$(jq -r '.timestamp // 0' "$RUN_JSON")"
	[[ ${#RUN_AT} -gt 10 ]] && RUN_AT=$((RUN_AT / 1000))
	[[ "$RUN_AT" -ge "$STARTED_AT" ]] \
		|| die "$RUN_JSON predates this run — the broadcast failed before sending anything"
fi

[[ -f "$RUN_JSON" ]] || die "no broadcast record at $RUN_JSON to verify"

# --- read what was deployed -------------------------------------------------

created() {
	jq -r --arg n "$1" \
		'first(.transactions[] | select(.contractName == $n and .transactionType == "CREATE") | .contractAddress) // empty' \
		"$RUN_JSON"
}
block_of() {
	local hex
	hex="$(jq -r --arg a "$1" \
		'first(.receipts[] | select(((.contractAddress // "") | ascii_downcase) == ($a | ascii_downcase)) | .blockNumber) // empty' \
		"$RUN_JSON")"
	[[ -n "$hex" ]] && printf '%d' "$((hex))"
}

FUND="$(created InsuranceFund)"
FACTORY="$(created VaultFactory)"
[[ -n "$FUND" && -n "$FACTORY" ]] \
	|| die "the broadcast log holds no InsuranceFund/VaultFactory creation — the deploy did not complete"

FUND_BLOCK="$(block_of "$FUND")"
FACTORY_BLOCK="$(block_of "$FACTORY")"
# The indexer backfills both contracts from a single block, so it has to be the
# earlier of the two or the fund's first events are simply never seen.
START_BLOCK="${FUND_BLOCK:-$FACTORY_BLOCK}"
[[ -n "$FACTORY_BLOCK" && "$FACTORY_BLOCK" -lt "$START_BLOCK" ]] && START_BLOCK="$FACTORY_BLOCK"

echo
info "InsuranceFund  $FUND"
info "VaultFactory   $FACTORY"
info "start block    ${START_BLOCK:-unknown}"

# --- verify -----------------------------------------------------------------
#
# `--verify` on the broadcast usually handles this. It fails often enough for
# reasons that have nothing to do with the contracts — a cold Etherscan index, a
# rate limit — that a second explicit pass is worth having. It is idempotent: an
# already-verified contract just says so and exits clean.

verify_one() {
	local addr="$1" target="$2"
	info "verifying $target at $addr"
	(cd "$CONTRACTS" && forge verify-contract "$addr" "$target" \
		--chain "$CHAIN_ID" --verifier "$VERIFIER" ${VERIFIER_FLAGS[@]+"${VERIFIER_FLAGS[@]}"} \
		--rpc-url "$RPC_URL" --guess-constructor-args --watch) \
		|| warn "could not verify $target. Retry alone with: VERIFY_ONLY=1 CHAIN=$CHAIN_KEY scripts/deploy-contracts.sh $ENV_FILE"
}

echo
verify_one "$FUND" "src/InsuranceFund.sol:InsuranceFund"
verify_one "$FACTORY" "src/VaultFactory.sol:VaultFactory"

# --- write the env file -----------------------------------------------------

if [[ "$VERIFY_ONLY" == "1" ]]; then
	echo
	bold "Verified"
	echo "  $EXPLORER/address/$FACTORY"
	echo "  $EXPLORER/address/$FUND"
	exit 0
fi

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

BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$BACKUP"

# Suffixed, always — including for Base.
#
# A chain is enabled iff its factory variable is set, so the suffix is not
# decoration: it is the thing that says *which* chain this factory turns on.
# Writing Base's addresses unsuffixed would leave Base indistinguishable from
# "the deployment default", and a later Arbitrum deploy could not tell whether
# the unsuffixed value was Base's or a leftover.
set_env "VAULT_FACTORY_ADDRESS_$ENV_SUFFIX" "$FACTORY"
set_env "INSURANCE_FUND_ADDRESS_$ENV_SUFFIX" "$FUND"
[[ -n "$START_BLOCK" ]] && set_env "VAULT_FACTORY_START_BLOCK_$ENV_SUFFIX" "$START_BLOCK"
# The browser cannot read server-only values, so the factory address is
# duplicated. The two disagreeing is the failure this script exists to prevent.
set_env "VITE_VAULT_FACTORY_ADDRESS_$ENV_SUFFIX" "$FACTORY"
set_env "USDC_ADDRESS_$ENV_SUFFIX" "$VAULT_ASSET_ADDRESS"
set_env "RPC_URL_$ENV_SUFFIX" "$RPC_URL"

# Base also keeps its unsuffixed names, which every older `.env`, the compose
# files and the e2e fixtures still read. Written for Base only: the unsuffixed
# names mean Base everywhere they are read, so pointing them at another chain
# would quietly repoint the whole single-chain code path.
if [[ "$ENV_SUFFIX" == "BASE" ]]; then
	set_env VAULT_FACTORY_ADDRESS "$FACTORY"
	set_env INSURANCE_FUND_ADDRESS "$FUND"
	[[ -n "$START_BLOCK" ]] && set_env VAULT_FACTORY_START_BLOCK "$START_BLOCK"
	set_env VITE_VAULT_FACTORY_ADDRESS "$FACTORY"
	set_env USDC_ADDRESS "$VAULT_ASSET_ADDRESS"
fi

set_env VAULT_ADMIN_ADDRESS "$VAULT_ADMIN_ADDRESS"
set_env VAULT_GUARDIAN_ADDRESS "$VAULT_GUARDIAN_ADDRESS"
set_env INSURANCE_TREASURER_ADDRESS "$INSURANCE_TREASURER_ADDRESS"

echo
bold "Done"
cat <<-NEXT
	  $ENV_FILE updated (previous copy at $BACKUP)

	  $EXPLORER/address/$FACTORY
	  $EXPLORER/address/$FUND

	Next:
	  bun run contracts:build     # regenerate ts/abi.ts from the new artifacts
	  scripts/indexer-reset.sh    # vault addresses repeat across deployments
	  scripts/dev.sh              # then create a vault from the admin dashboard
NEXT
