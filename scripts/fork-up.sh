#!/usr/bin/env bash
#
# Bring up a Base-mainnet fork with the whole protocol deployed and seeded.
#
# The point of a fork rather than a local chain is what the agent trades into.
# `DeployLocal.s.sol` gives you a working app on a chain where USDC is a mock
# and every pool is empty; this gives you the same app on a chain where USDC is
# Circle's, the KyberSwap routes are the real Base pools, and the vaults carry
# the same limits production deploys with. Those are the parts that cannot be
# tested any other way short of spending real money.
#
# Writes .env.fork, which the app reads with `bun run dev:fork`.
#
# Usage: scripts/fork-up.sh [--block <number>] [--port <port>]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT=8545
BLOCK=""
FORK_SOURCE="${BASE_RPC_URL:-https://mainnet.base.org}"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--block) BLOCK="$2"; shift 2 ;;
		--port) PORT="$2"; shift 2 ;;
		--rpc) FORK_SOURCE="$2"; shift 2 ;;
		*) echo "unknown argument: $1" >&2; exit 1 ;;
	esac
done

RPC="http://127.0.0.1:${PORT}"

# Circle's USDC on Base, and the account allowed to appoint minters on it. We
# impersonate the master minter rather than writing the balance mapping
# directly: minting through the token's own code keeps `totalSupply` consistent
# and survives Circle upgrading the storage layout, which a hardcoded slot
# number would not.
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Anvil's first two accounts, and the two agent EOAs `DeployFork.s.sol` uses.
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ALICE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
AGENT_A=0xc69e41c1f9634810Fd783701958efEECdd6BEc1a
AGENT_B=0xC0ed2Ae172011fBe35B14C72339069c9aF2e931d

LOG_DIR="${ROOT}/.fork"
mkdir -p "$LOG_DIR"

# --- anvil ------------------------------------------------------------------
if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
	echo "==> anvil already listening on ${PORT}; reusing it"
else
	echo "==> starting anvil, forking Base from ${FORK_SOURCE}"
	# --chain-id 8453 matters: the app, the indexer and every wallet expect Base's
	# id, and a fork that reports 31337 makes wagmi refuse to send.
	# --auto-impersonate is what lets the seeded vaults name the *real* NEAR-derived
	# agent wallets. Those have no private key anywhere — that is the whole design
	# — so nothing could otherwise sign as them, and a fork whose agents are
	# throwaway EOAs cannot show the Solana leg or verify its own derivation.
	ANVIL_ARGS=(--fork-url "$FORK_SOURCE" --chain-id 8453 --port "$PORT" --accounts 10 --balance 10000 --auto-impersonate --silent)
	[[ -n "$BLOCK" ]] && ANVIL_ARGS+=(--fork-block-number "$BLOCK")
	nohup anvil "${ANVIL_ARGS[@]}" > "${LOG_DIR}/anvil.log" 2>&1 &
	echo "$!" > "${LOG_DIR}/anvil.pid"

	until cast block-number --rpc-url "$RPC" >/dev/null 2>&1; do sleep 1; done
fi

FORK_BLOCK="$(cast block-number --rpc-url "$RPC")"
echo "    forked at Base block ${FORK_BLOCK}"

# --- agents -----------------------------------------------------------------
# Prefer the wallets the NEAR MPC network actually derives. A vault bakes its
# agent address in permanently, so this is the only moment it can be chosen — and
# choosing the real one is what makes the vault page able to show the Solana leg
# and mark the derivation as checked. Without NEAR configured we fall back to two
# throwaway EOAs, which works but leaves the Solana address unknowable: an anvil
# account has no Ed25519 sibling to derive one from.
if [[ -n "${NEAR_ACCOUNT_ID:-}" && -n "${NEAR_PRIVATE_KEY:-}" ]]; then
	echo "==> deriving agent wallets from NEAR"
	if DERIVED="$(bun run scripts/agent-addresses.ts --env 2>/dev/null)"; then
		eval "$DERIVED"
		export AGENT_A_ADDRESS AGENT_B_ADDRESS
		AGENT_A="$AGENT_A_ADDRESS"
		AGENT_B="$AGENT_B_ADDRESS"
		echo "    conservative ${AGENT_A}  solana ${AGENT_A_SOLANA}"
		echo "    leveraged    ${AGENT_B}  solana ${AGENT_B_SOLANA}"
	else
		echo "    derivation failed; falling back to local agent keys" >&2
	fi
else
	echo "==> NEAR not configured; using local agent keys (no Solana leg on the vault page)"
fi

# --- gas --------------------------------------------------------------------
# The agents are accounts anvil has never heard of, so they start at zero.
echo "==> funding agent gas"
for a in "$AGENT_A" "$AGENT_B"; do
	cast rpc anvil_setBalance "$a" 0x8AC7230489E80000 --rpc-url "$RPC" >/dev/null
done

# --- USDC -------------------------------------------------------------------
echo "==> minting USDC to the deployer and Alice"
MASTER_MINTER="$(cast call "$USDC" 'masterMinter()(address)' --rpc-url "$RPC")"
cast rpc anvil_impersonateAccount "$MASTER_MINTER" --rpc-url "$RPC" >/dev/null
cast rpc anvil_setBalance "$MASTER_MINTER" 0xDE0B6B3A7640000 --rpc-url "$RPC" >/dev/null
cast send "$USDC" 'configureMinter(address,uint256)' "$DEPLOYER" 100000000000000 \
	--unlocked --from "$MASTER_MINTER" --rpc-url "$RPC" >/dev/null
cast rpc anvil_stopImpersonatingAccount "$MASTER_MINTER" --rpc-url "$RPC" >/dev/null

cast send "$USDC" 'mint(address,uint256)' "$DEPLOYER" 2000000000000 \
	--private-key "$DEPLOYER_PK" --rpc-url "$RPC" >/dev/null
cast send "$USDC" 'mint(address,uint256)' "$ALICE" 100000000000 \
	--private-key "$DEPLOYER_PK" --rpc-url "$RPC" >/dev/null

echo "    deployer $(cast call "$USDC" 'balanceOf(address)(uint256)' "$DEPLOYER" --rpc-url "$RPC" | cut -d' ' -f1) USDC base units"
echo "    alice    $(cast call "$USDC" 'balanceOf(address)(uint256)' "$ALICE" --rpc-url "$RPC" | cut -d' ' -f1) USDC base units"

# --- deploy -----------------------------------------------------------------
echo "==> deploying and seeding"
DEPLOY_BLOCK="$(cast block-number --rpc-url "$RPC")"
(cd packages/contracts && forge script script/DeployFork.s.sol:DeployFork \
	--rpc-url "$RPC" --broadcast --slow --unlocked) | tee "${LOG_DIR}/deploy.log" | tail -20

read_addr() { grep -m1 "^  $1" "${LOG_DIR}/deploy.log" | awk '{print $NF}'; }

FACTORY="$(read_addr 'VaultFactory')"
FUND="$(read_addr 'InsuranceFund')"
CONSERVATIVE="$(read_addr 'Conservative')"
LEVERAGED="$(read_addr 'Leveraged')"

if [[ -z "$FACTORY" ]]; then
	echo "could not read the factory address out of the deploy log" >&2
	exit 1
fi

# --- NAV rounds -------------------------------------------------------------
# `minNavReportInterval` is fifteen minutes, so each round needs the clock moved
# on. Warping is also the only way to get a share-price series worth looking at
# out of a chain that has existed for thirty seconds.
#
# Eight rounds six hours apart, spanning two days. The span is the point: the
# indexer refuses to annualise a window shorter than a day, correctly — the
# exponent in `growth ^ (year / window)` is the error term, and an afternoon of
# data extrapolates to figures with twenty digits in them. Two days is the least
# that produces a `7d realised` number the app will actually show.
#
# The increments are basis points, not percent, and they are small on purpose. A
# cash-and-carry earns funding: five basis points a day is roughly 20% a year,
# which is what this trade looks like when it is working. Seeding 2% a round
# would have produced a share-price chart that no basis vault could ever draw.
#
# Two rounds are negative. A seeded chain where the number only ever goes up
# hides every drawdown path in the app — and the high-water mark that the
# performance fee is charged over is defined by exactly that case.
echo "==> reporting NAV rounds"
export FORK_VAULT_CONSERVATIVE="$CONSERVATIVE"
export FORK_VAULT_LEVERAGED="$LEVERAGED"
for gain in 2 1 3 -1 2 1 2 -1; do
	cast rpc evm_increaseTime 21600 --rpc-url "$RPC" >/dev/null
	cast rpc evm_mine --rpc-url "$RPC" >/dev/null
	GAIN_BPS="$gain" \
		bash -c "cd packages/contracts && forge script script/SeedForkNav.s.sol:SeedForkNav --rpc-url '$RPC' --broadcast --slow --unlocked" \
		>> "${LOG_DIR}/deploy.log" 2>&1
	echo "    round ${gain}bps"
done

# --- env --------------------------------------------------------------------
# A separate file rather than edits to .env: the fork's addresses are throwaway
# and overwriting the real ones would quietly repoint a later mainnet run at a
# factory that does not exist there.
cat > .env.fork <<ENV
# Generated by scripts/fork-up.sh — do not edit, it is overwritten on every run.
# Loaded on top of .env by \`bun run dev:fork\`.

CHAIN_ID=8453
BASE_RPC_URL=${RPC}
PONDER_RPC_URL_BASE=${RPC}
VITE_BASE_RPC_URL=${RPC}

# The wallet needs the fork described, not just Base's id with a different
# transport. Note the name: MetaMask keys networks by chain id, and 8453 is
# already Base, so the fork is offered as a separate entry rather than silently
# rewriting the user's real Base RPC.
VITE_CHAIN_ID=8453
VITE_CHAIN_NAME="Base Fork (local)"
VITE_CHAIN_RPC_URL=${RPC}
VITE_CHAIN_EXPLORER_URL=https://basescan.org

USDC_ADDRESS=${USDC}
VAULT_FACTORY_ADDRESS=${FACTORY}
VITE_VAULT_FACTORY_ADDRESS=${FACTORY}
INSURANCE_FUND_ADDRESS=${FUND}
VAULT_FACTORY_START_BLOCK=${DEPLOY_BLOCK}

VAULT_ADMIN_ADDRESS=${DEPLOYER}
VAULT_GUARDIAN_ADDRESS=${DEPLOYER}
INSURANCE_TREASURER_ADDRESS=${DEPLOYER}
ADMIN_ADDRESSES=${DEPLOYER}

# The perp leg points at Pacifica's testnet while the spot leg runs against
# forked mainnet liquidity. They are separate venues on separate chains, so
# there is no consistency to break by mixing them — and it is the only
# combination in which both legs can be exercised without real money.
PACIFICA_API_URL=https://test-api.pacifica.fi/api/v1

# Seeded vaults, for convenience.
FORK_VAULT_CONSERVATIVE=${CONSERVATIVE}
FORK_VAULT_LEVERAGED=${LEVERAGED}
ENV

echo
echo "==> fork is up"
echo "    RPC           ${RPC}  (Base, chain id 8453, block ${FORK_BLOCK})"
echo "    VaultFactory  ${FACTORY}"
echo "    InsuranceFund ${FUND}"
echo "    Conservative  ${CONSERVATIVE}"
echo "    Leveraged     ${LEVERAGED}"
echo "    wrote .env.fork"
echo
echo "    next: bun run dev:fork"
