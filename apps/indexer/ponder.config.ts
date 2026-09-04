import { lemonVaultAbi, vaultFactoryAbi } from "@lemon/contracts";
import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";

/**
 * Vaults are not known at build time.
 *
 * The factory deploys them as an operator adds markets, so the address list has
 * to come from the chain rather than from configuration. Ponder's `factory()`
 * reads `VaultCreated` and starts following each child from its own deployment
 * block — which also means a vault created five minutes ago is indexed from its
 * first block rather than from wherever the indexer happened to be.
 */
const vaultCreated = parseAbiItem(
	"event VaultCreated(address indexed vault, bytes32 indexed marketId, address indexed agentWallet, string name, string symbol, uint8 tier, uint32 targetLeverageBps, uint32 maxLeverageBps)",
);

const FACTORY_ADDRESS = (process.env.VAULT_FACTORY_ADDRESS ??
	"0x0000000000000000000000000000000000000000") as `0x${string}`;

/**
 * The block the factory was deployed in.
 *
 * Indexing from genesis on Base would be tens of millions of empty blocks and
 * hours of RPC. There is nothing to find before the factory existed.
 */
const START_BLOCK = Number(process.env.VAULT_FACTORY_START_BLOCK ?? 0);

export default createConfig({
	ordering: "omnichain",
	database: process.env.DATABASE_URL
		? { kind: "postgres", connectionString: process.env.DATABASE_URL }
		: { kind: "pglite" },
	chains: {
		base: {
			id: 8453,
			rpc:
				process.env.PONDER_RPC_URL_BASE ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
		},
	},
	contracts: {
		VaultFactory: {
			chain: "base",
			abi: vaultFactoryAbi,
			address: FACTORY_ADDRESS,
			startBlock: START_BLOCK,
		},
		LemonVault: {
			chain: "base",
			abi: lemonVaultAbi,
			address: factory({
				address: FACTORY_ADDRESS,
				event: vaultCreated,
				parameter: "vault",
			}),
			startBlock: START_BLOCK,
		},
	},
});
