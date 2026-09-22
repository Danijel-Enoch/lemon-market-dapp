/**
 * Print the agent wallets the NEAR MPC network derives for each vault.
 *
 * A vault's agent address is immutable once the factory has been called, and it
 * has to be the address the MPC network will actually sign for — otherwise the
 * vault is created with an agent nobody controls and can never trade again.
 * Deriving it here, before the deploy, is what lets a scripted deployment create
 * vaults the live agent process can pick up.
 *
 * Reads only. Derivation is pure computation against pinned root keys; the one
 * RPC call confirms those keys still match the contract.
 *
 * Usage: bun run scripts/agent-addresses.ts [--env]
 *   --env  print as shell assignments, for `eval` or an overlay file
 *
 * Prints every chain, because the agent wallet for one market and tier is a
 * *different* wallet on each. The derivation path carries the chain, so "the
 * ETH conservative agent" is three addresses, and funding the Base one does
 * nothing for the Arbitrum vault of the same name.
 */

import { allChains } from "@lemon/core";
import { agentDerivationPath, NearMpcClient } from "@lemon/near-mpc";

const VAULTS = [
	{ ticker: "ETH", tier: "conservative" },
	{ ticker: "BTC", tier: "leveraged" },
] as const;

const accountId = process.env.NEAR_ACCOUNT_ID?.trim();
const privateKey = process.env.NEAR_PRIVATE_KEY?.trim();

if (!accountId || !privateKey) {
	console.error("NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required to derive an agent wallet.");
	process.exit(1);
}

const client = new NearMpcClient({
	accountId,
	privateKey,
	rpcUrl: process.env.NEAR_RPC_URL,
	contractId: process.env.NEAR_MPC_CONTRACT_ID,
});

await client.verifyRootKeys();

const asEnv = process.argv.includes("--env");
const names = ["AGENT_A", "AGENT_B"];

for (const chain of allChains()) {
	if (!asEnv) console.log(`\n${chain.name} (${chain.id})`);

	VAULTS.forEach((vault, i) => {
		const path = agentDerivationPath(vault.ticker, vault.tier, chain.key);
		const { evmAddress, solanaAddress } = client.derive(path);
		if (asEnv) {
			// Suffixed by chain, because these are assignments an overlay file
			// consumes and two chains' agents must not land on the same name.
			const name = `${names[i]}_${chain.envSuffix}`;
			console.log(`${name}_ADDRESS=${evmAddress}`);
			console.log(`${name}_SOLANA=${solanaAddress}`);
			console.log(`${name}_PATH=${path}`);
		} else {
			console.log(`  ${vault.tier.padEnd(12)} ${vault.ticker.padEnd(4)} ${path}`);
			console.log(`    EVM    ${evmAddress}`);
			console.log(`    Solana ${solanaAddress}`);
		}
	});
}
