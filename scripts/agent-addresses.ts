/**
 * Print the agent wallets the NEAR MPC network derives for each vault.
 *
 * A vault's agent address is immutable once the factory has been called, and it
 * has to be the address the MPC network will actually sign for — otherwise the
 * vault is created with an agent nobody controls and can never trade again.
 * Deriving it here, before the deploy, is what lets `fork-up.sh` and
 * `testnet-up.sh` create vaults the live agent process can pick up.
 *
 * Reads only. Derivation is pure computation against pinned root keys; the one
 * RPC call confirms those keys still match the contract.
 *
 * Usage: bun run scripts/agent-addresses.ts [--env]
 *   --env  print as shell assignments, for `eval` or an overlay file
 */

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
	network: process.env.NEAR_NETWORK === "testnet" ? "testnet" : "mainnet",
	accountId,
	privateKey,
	rpcUrl: process.env.NEAR_RPC_URL,
	contractId: process.env.NEAR_MPC_CONTRACT_ID,
});

await client.verifyRootKeys();

const asEnv = process.argv.includes("--env");
const names = ["AGENT_A", "AGENT_B"];

VAULTS.forEach((vault, i) => {
	const path = agentDerivationPath(vault.ticker, vault.tier);
	const { evmAddress, solanaAddress } = client.derive(path);
	if (asEnv) {
		console.log(`${names[i]}_ADDRESS=${evmAddress}`);
		console.log(`${names[i]}_SOLANA=${solanaAddress}`);
		console.log(`${names[i]}_PATH=${path}`);
	} else {
		console.log(`${vault.tier.padEnd(12)} ${vault.ticker.padEnd(4)} ${path}`);
		console.log(`  EVM    ${evmAddress}`);
		console.log(`  Solana ${solanaAddress}`);
	}
});
