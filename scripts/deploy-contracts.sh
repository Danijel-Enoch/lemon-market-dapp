#!/usr/bin/env bash
#
# Deploy InsuranceFund + VaultFactory to Base and verify them on Basescan.
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
# Usage:
#   scripts/deploy-contracts.sh                # deploy, write results to .env
#   scripts/deploy-contracts.sh .env.local     # write results there instead
#   VERIFY_ONLY=1 scripts/deploy-contracts.sh  # re-verify the last deploy, no key needed

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTRACTS="$ROOT/packages/contracts"
ENV_FILE="${1:-.env}"
VERIFY_ONLY="${VERIFY_ONLY:-0}"
EXPECTED_CHAIN_ID=8453
DEFAULT_RPC="https://mainnet.base.org"
BASE_USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

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

RPC_DEFAULT="$(env_get BASE_RPC_URL)"; RPC_DEFAULT="${RPC_DEFAULT:-$DEFAULT_RPC}"
ADMIN_DEFAULT="$(env_get VAULT_ADMIN_ADDRESS)"
GUARDIAN_DEFAULT="$(env_get VAULT_GUARDIAN_ADDRESS)"
TREASURER_DEFAULT="$(env_get INSURANCE_TREASURER_ADDRESS)"
ASSET_DEFAULT="$(env_get USDC_ADDRESS)"; ASSET_DEFAULT="${ASSET_DEFAULT:-$BASE_USDC}"

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
	bold "Re-verify the last Lemon deploy"
else
	bold "Deploy the Lemon vault contracts"
fi
echo

if [[ "$VERIFY_ONLY" != "1" ]]; then
	prompt_secret PRIVATE_KEY "Deployer private key (hidden, paste and press enter)"
	PRIVATE_KEY="${PRIVATE_KEY#0x}"
	[[ "$PRIVATE_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || die "that is not a 32-byte private key"
	PRIVATE_KEY="0x$PRIVATE_KEY"
fi

prompt_secret ETHERSCAN_API_KEY "Etherscan API key (hidden — etherscan.io/myapikey, one key covers Basescan)"
[[ -n "$ETHERSCAN_API_KEY" ]] || die "an API key is required; verification is the whole second half of this script"
export ETHERSCAN_API_KEY

prompt_value RPC_URL "Base RPC URL" "$RPC_DEFAULT"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)" || die "cannot reach $RPC_URL"
if [[ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
	warn "that RPC is chain $CHAIN_ID, not Base mainnet ($EXPECTED_CHAIN_ID)"
	prompt_value CONFIRM_CHAIN "Continue anyway? (yes/no)" "no"
	[[ "$CONFIRM_CHAIN" == "yes" ]] || exit 1
fi

# Check the API key now rather than after the gas is spent. A bad key turns a
# successful deploy into an unverified one — fixable, but only noisily.
KEY_STATUS="$(curl -fsS --max-time 20 \
	"https://api.etherscan.io/v2/api?chainid=$CHAIN_ID&module=stats&action=ethprice&apikey=$ETHERSCAN_API_KEY" \
	2>/dev/null | jq -r '.status // "0"')" || KEY_STATUS="0"
[[ "$KEY_STATUS" == "1" ]] || warn "Etherscan rejected that API key. Continuing; verification will probably fail."

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
	[[ "$BALANCE_WEI" != "0" ]] || die "$DEPLOYER holds no ETH on chain $CHAIN_ID — bridge gas first"
	BALANCE_ETH="$(cast from-wei "$BALANCE_WEI")"

	# The asset is immutable on the factory, so a wrong one here means every
	# vault it ever makes is dead on arrival. The factory does not check.
	ASSET_SYMBOL="$(cast call "$VAULT_ASSET_ADDRESS" 'symbol()(string)' --rpc-url "$RPC_URL" 2>/dev/null | tr -d '"')" \
		|| die "$VAULT_ASSET_ADDRESS does not answer symbol() — that is not an ERC-20 on this chain"

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
	bold "About to broadcast to chain $CHAIN_ID"
	cat <<-SUMMARY
		  deployer     $DEPLOYER  ($BALANCE_ETH ETH)
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
		--broadcast --verify --verifier etherscan --chain "$CHAIN_ID" --slow) \
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
		--chain "$CHAIN_ID" --verifier etherscan \
		--rpc-url "$RPC_URL" --guess-constructor-args --watch) \
		|| warn "could not verify $target. Retry alone with: VERIFY_ONLY=1 scripts/deploy-contracts.sh $ENV_FILE"
}

echo
verify_one "$FUND" "src/InsuranceFund.sol:InsuranceFund"
verify_one "$FACTORY" "src/VaultFactory.sol:VaultFactory"

# --- write the env file -----------------------------------------------------

if [[ "$VERIFY_ONLY" == "1" ]]; then
	echo
	bold "Verified"
	echo "  https://basescan.org/address/$FACTORY"
	echo "  https://basescan.org/address/$FUND"
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

set_env VAULT_FACTORY_ADDRESS "$FACTORY"
set_env INSURANCE_FUND_ADDRESS "$FUND"
[[ -n "$START_BLOCK" ]] && set_env VAULT_FACTORY_START_BLOCK "$START_BLOCK"
# The browser cannot read server-only values, so the factory address is
# duplicated. The two disagreeing is the failure this script exists to prevent.
set_env VITE_VAULT_FACTORY_ADDRESS "$FACTORY"
set_env USDC_ADDRESS "$VAULT_ASSET_ADDRESS"
set_env VAULT_ADMIN_ADDRESS "$VAULT_ADMIN_ADDRESS"
set_env VAULT_GUARDIAN_ADDRESS "$VAULT_GUARDIAN_ADDRESS"
set_env INSURANCE_TREASURER_ADDRESS "$INSURANCE_TREASURER_ADDRESS"

echo
bold "Done"
cat <<-NEXT
	  $ENV_FILE updated (previous copy at $BACKUP)

	  https://basescan.org/address/$FACTORY
	  https://basescan.org/address/$FUND

	Next:
	  bun run contracts:build     # regenerate ts/abi.ts from the new artifacts
	  scripts/indexer-reset.sh    # vault addresses repeat across deployments
	  scripts/dev.sh              # then create a vault from the admin dashboard
NEXT
