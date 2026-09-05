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
 * Idempotent. Run it after any deploy that creates vaults.
 *
 * Usage: bun run scripts/seed-venue-config.ts
 */

import { prisma } from "@lemon/db";
import { agentDerivationPath, NearMpcClient } from "@lemon/near-mpc";
import { PERP_CRYPTO_TOKENS } from "@lemon/registry";

const API_URL = process.env.AGENT_API_URL ?? "http://localhost:3002/api";

interface IndexedVault {
	address: `0x${string}`;
	ticker: string | null;
	riskTier: number;
	agentWallet: `0x${string}`;
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
 */
const live = new Set(vaults.map((v) => v.address.toLowerCase()));
const stored = await prisma.vaultConfig.findMany({ select: { address: true, ticker: true } });
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

	const token = PERP_CRYPTO_TOKENS.find((t) => t.ticker.toUpperCase() === ticker);
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
		assetClass: "CRYPTO" as const,
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
