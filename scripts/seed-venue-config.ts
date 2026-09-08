/**
 * Write the venue configuration for every vault the indexer knows about.
 *
 * A vault is created on-chain with an agent address and a market id, and that is
 * all the chain carries — `marketId` is a hash, so the ticker does not survive
 * it, and neither does the spot token, the perp symbol or the derivation path.
 * Those live in Postgres, written by the admin console's create-vault flow.
 *
 * A vault created outside that flow has none of it, which is why it shows "No
 * venue config" and the agent skips it. This backfills the same rows the admin
 * flow would have written, from the registry and from NEAR, so a scripted
 * deployment behaves like an operator-created one.
 *
 * Idempotent, and safe to run on every deploy — which is what the `seed` service
 * in `docker-compose.dokploy.yml` does.
 *
 * Usage: bun run scripts/seed-venue-config.ts
 */

import { assetClassForTicker } from "@lemon/core";
import { prisma } from "@lemon/db";
import { agentDerivationPath, NearMpcClient } from "@lemon/near-mpc";
import { findTokenByTicker } from "@lemon/registry";
import { indexerHealth } from "../apps/api/src/services/indexer-health";

const API_URL = process.env.AGENT_API_URL ?? "http://localhost:3002/api";

interface IndexedVault {
	address: `0x${string}`;
	ticker: string | null;
	riskTier: number;
	agentWallet: `0x${string}`;
}

/**
 * The ticker's asset class, in the spelling Prisma's enum uses.
 *
 * `assetClassForTicker` curates rather than infers and answers `"unknown"` for
 * anything it does not recognise, which the enum spells `UNKNOWN` — so an
 * unclassified ticker lands in the board's "Other" tab instead of being filed
 * somewhere confidently wrong.
 */
function toVaultAssetClass(ticker: string) {
	return assetClassForTicker(ticker).toUpperCase() as Uppercase<
		ReturnType<typeof assetClassForTicker>
	>;
}

const accountId = process.env.NEAR_ACCOUNT_ID?.trim();
const privateKey = process.env.NEAR_PRIVATE_KEY?.trim();
if (!accountId || !privateKey) {
	console.error("NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required: the row records the agent's");
	console.error("derivation path and Solana address, and both come from the MPC network.");
	process.exit(1);
}

const mpc = new NearMpcClient({
	accountId,
	privateKey,
	rpcUrl: process.env.NEAR_RPC_URL,
	contractId: process.env.NEAR_MPC_CONTRACT_ID,
});

await mpc.verifyRootKeys();

/**
 * Whether the vault list this is about to act on can be believed.
 *
 * The upserts below are additive and safe against a partial list. The stale
 * cleanup is not: it treats "absent from the indexer" as "absent from the
 * chain", and those are the same sentence only once the backfill has finished.
 * Run against a half-synced read model it deletes the configuration — and the
 * agent-run history — of every vault the indexer has not reached yet, which
 * presents afterwards as "No venue configuration exists for 0x…" on a vault
 * that was configured correctly ten minutes earlier.
 *
 * That was survivable while this was a command an operator typed deliberately.
 * As a service that runs on every deploy it is not, because a deploy onto a
 * fresh indexer volume is exactly when the backfill is incomplete.
 *
 * `behind` is allowed through with `synced`: it means the backfill finished and
 * the vault set is complete, and only recent blocks are missing. A vault
 * created in the last thirty blocks is absent from `stored` too, so it is not a
 * deletion candidate.
 */
const health = await indexerHealth();

if (health.state === "unreachable") {
	console.error(health.summary);
	if (health.remedy) console.error(health.remedy);
	process.exit(1);
}

const canPrune = health.state === "synced" || health.state === "behind";
if (!canPrune) {
	console.warn(`indexer: ${health.state} — ${health.summary}`);
	console.warn("Configuring the vaults it does know about; leaving existing rows alone.");
	console.warn("Re-run once it has caught up to clear configuration for vaults that are gone.\n");
}

const response = await fetch(`${API_URL}/vaults`);
if (!response.ok) {
	console.error(`The API answered ${response.status} for the vault list. Is the stack running?`);
	process.exit(1);
}
const { vaults } = (await response.json()) as { vaults: IndexedVault[] };

if (vaults.length === 0) {
	console.log("No vaults indexed yet — nothing to configure.");
	process.exit(0);
}

/**
 * Drop configuration for vaults that are no longer on this chain.
 *
 * `agentPath`, `agentEvmAddress` and `agentSolanaAddress` are each unique, and a
 * path is derived from ticker and tier — so it is *stable across redeployments*
 * while the vault address is not. Without this, the second deploy of the same
 * market collides with the first one's row and the seeder fails on a constraint
 * that has nothing to do with what went wrong.
 *
 * `AgentRun` cascades from `VaultConfig`, so this also removes the run history
 * of the vaults it clears. That is correct — they are vaults no chain has any
 * more — but it is a deletion, so it says which ones and how many runs.
 *
 * Skipped entirely unless the read model is complete: see the health check
 * above. A vault missing from a backfilling indexer is not a vault that is gone.
 */
const live = new Set(vaults.map((v) => v.address.toLowerCase()));
const stored = canPrune
	? await prisma.vaultConfig.findMany({ select: { address: true, ticker: true } })
	: [];
const stale = stored.filter((row) => !live.has(row.address.toLowerCase()));

for (const row of stale) {
	const runs = await prisma.agentRun.count({ where: { vaultAddress: row.address } });
	await prisma.vaultConfig.delete({ where: { address: row.address } });
	console.log(
		`removed stale config for ${row.ticker} ${row.address} (not on this chain)` +
			(runs > 0 ? ` — and ${runs} agent run${runs === 1 ? "" : "s"} with it` : ""),
	);
}
if (stale.length) console.log();

for (const vault of vaults) {
	const ticker = vault.ticker?.toUpperCase();
	if (!ticker) {
		console.warn(`${vault.address}: no ticker resolved, skipping.`);
		continue;
	}

	// The whole spot universe, not just the crypto half. This looked up
	// `PERP_CRYPTO_TOKENS` until an equity vault needed backfilling and was told
	// its own ticker "is not in the curated token registry" — the B20 tokenized
	// equities live in `COINBASE_STOCK_TOKENS`, and `findTokenByTicker` spans
	// both. A vault whose spot leg is GOOGLc is exactly as configurable as one
	// whose spot leg is WETH, and the seeder claiming otherwise stranded the
	// equity vaults with no way to record them short of writing SQL by hand.
	const token = findTokenByTicker(ticker);
	if (!token) {
		// Refusing beats guessing: a wrong spot token hedges the position against
		// a different asset while every dashboard reads healthy.
		console.warn(`${vault.address}: ${ticker} is not in the curated token registry, skipping.`);
		continue;
	}

	const tier = vault.riskTier === 1 ? "leveraged" : "conservative";
	const path = agentDerivationPath(ticker, tier);
	const derived = mpc.derive(path);

	if (derived.evmAddress.toLowerCase() !== vault.agentWallet.toLowerCase()) {
		// The vault's agent is immutable, so a mismatch cannot be repaired by
		// writing a row — recording one anyway would hand the agent a wallet the
		// vault will not accept a withdrawal to.
		console.warn(
			`${vault.address}: ${path} derives ${derived.evmAddress} but the vault names ${vault.agentWallet}. Skipping — this vault was not created from the MPC network.`,
		);
		continue;
	}

	const row = {
		ticker,
		riskTier: vault.riskTier === 1 ? ("LEVERAGED" as const) : ("CONSERVATIVE" as const),
		// Classified from the curated ticker table rather than assumed. Hardcoding
		// CRYPTO here was harmless while only crypto vaults could be seeded, and
		// became a lie the moment an equity one could be — it files GOOGL under
		// the crypto tab on a board a depositor reads.
		assetClass: toVaultAssetClass(ticker),
		agentPath: path,
		agentEvmAddress: derived.evmAddress.toLowerCase(),
		agentSolanaAddress: derived.solanaAddress,
		spotTokenAddress: token.address.toLowerCase(),
		spotTokenDecimals: token.decimals,
		spotTokenSymbol: token.symbol,
		perpSymbol: ticker,
		slippagePercent: Number(process.env.AGENT_SLIPPAGE_PERCENT ?? 0.5),
		agentEnabled: true,
		createdBy: "scripts/seed-venue-config.ts",
	};

	await prisma.vaultConfig.upsert({
		where: { address: vault.address.toLowerCase() },
		create: { address: vault.address.toLowerCase(), ...row },
		update: row,
	});

	console.log(`${ticker.padEnd(5)} ${vault.address}`);
	console.log(`      spot ${token.symbol} ${token.address}`);
	console.log(`      perp ${ticker}  agent ${derived.evmAddress} / ${derived.solanaAddress}`);
}

await prisma.$disconnect();
