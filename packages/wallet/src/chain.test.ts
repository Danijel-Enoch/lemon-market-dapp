import { describe, expect, it } from "bun:test";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, XLAYER_CHAIN_ID } from "@lemon/core";
import { arbitrum, base, xLayer } from "viem/chains";
import { buildChain, factoryFor, resolveEnabledChains } from "./chain";

const FACTORY = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

/**
 * The chain set is not configurable; which of them are live, and their
 * endpoints, are.
 *
 * These tests exist to keep that distinction from eroding. A variable that
 * introduced an unknown chain id would let a build render against a network
 * where every vault write reverts, so the environment may only choose among the
 * three below and say which door onto each it knocks on.
 */
describe("buildChain", () => {
	it("is each chain's canonical definition with no configuration", () => {
		expect(buildChain(BASE_CHAIN_ID, {}).id).toBe(base.id);
		expect(buildChain(ARBITRUM_CHAIN_ID, {}).id).toBe(arbitrum.id);
		expect(buildChain(XLAYER_CHAIN_ID, {}).id).toBe(xLayer.id);
	});

	it("overrides only the RPC endpoint", () => {
		const chain = buildChain(ARBITRUM_CHAIN_ID, {
			VITE_RPC_URL_ARBITRUM: "https://rpc.example.test",
		});
		expect(chain.id).toBe(arbitrum.id);
		expect(chain.name).toBe(arbitrum.name);
		expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.example.test");
	});

	it("keeps each chain's native currency, so wallet_addEthereumChain is correct", () => {
		// X Layer charges gas in OKB. A chain object that claimed ETH would have
		// the wallet add a network whose balances read as the wrong asset.
		expect(buildChain(XLAYER_CHAIN_ID, {}).nativeCurrency.symbol).toBe("OKB");
		expect(buildChain(BASE_CHAIN_ID, {}).nativeCurrency.symbol).toBe("ETH");
	});

	it("keeps canonical contracts, so wagmi still batches reads", () => {
		const chain = buildChain(BASE_CHAIN_ID, { VITE_RPC_URL_BASE: "https://rpc.example.test" });
		expect(chain.contracts?.multicall3?.address).toBe(base.contracts.multicall3.address);
	});

	it("ignores blank values rather than building an unusable transport", () => {
		const chain = buildChain(BASE_CHAIN_ID, { VITE_RPC_URL_BASE: "   " });
		expect(chain.rpcUrls.default.http[0]).toBe(base.rpcUrls.default.http[0]);
	});

	describe("the pre-multichain variable names", () => {
		it("still honours VITE_CHAIN_RPC_URL, and it still means Base", () => {
			expect(
				buildChain(BASE_CHAIN_ID, { VITE_CHAIN_RPC_URL: "https://old.example.test" }).rpcUrls
					.default.http[0],
			).toBe("https://old.example.test");
			// Not inherited by the chains that did not exist when it did.
			expect(
				buildChain(ARBITRUM_CHAIN_ID, { VITE_CHAIN_RPC_URL: "https://old.example.test" }).rpcUrls
					.default.http[0],
			).toBe(arbitrum.rpcUrls.default.http[0]);
		});

		it("still honours the older VITE_BASE_RPC_URL", () => {
			const chain = buildChain(BASE_CHAIN_ID, { VITE_BASE_RPC_URL: "https://older.example.test" });
			expect(chain.rpcUrls.default.http[0]).toBe("https://older.example.test");
		});

		it("prefers the suffixed name over both", () => {
			const chain = buildChain(BASE_CHAIN_ID, {
				VITE_RPC_URL_BASE: "https://new.example.test",
				VITE_CHAIN_RPC_URL: "https://old.example.test",
				VITE_BASE_RPC_URL: "https://older.example.test",
			});
			expect(chain.rpcUrls.default.http[0]).toBe("https://new.example.test");
		});
	});
});

/**
 * A chain is offered iff it has a factory. This is the whole enable/disable
 * mechanism, so it gets tested rather than assumed.
 */
describe("resolveEnabledChains", () => {
	it("offers nothing when no factory is configured anywhere", () => {
		expect(resolveEnabledChains({})).toEqual([]);
	});

	it("offers only the chains with a factory", () => {
		const enabled = resolveEnabledChains({
			VITE_VAULT_FACTORY_ADDRESS_BASE: FACTORY,
			VITE_VAULT_FACTORY_ADDRESS_XLAYER: OTHER,
		});
		expect(enabled.map((e) => e.chain.id)).toEqual([BASE_CHAIN_ID, XLAYER_CHAIN_ID]);
		expect(enabled.map((e) => e.factory)).toEqual([FACTORY, OTHER]);
	});

	it("returns them in registry order regardless of which are set", () => {
		const enabled = resolveEnabledChains({
			VITE_VAULT_FACTORY_ADDRESS_XLAYER: OTHER,
			VITE_VAULT_FACTORY_ADDRESS_ARBITRUM: FACTORY,
		});
		expect(enabled.map((e) => e.chain.id)).toEqual([ARBITRUM_CHAIN_ID, XLAYER_CHAIN_ID]);
	});
});

describe("factoryFor", () => {
	it("reads the unsuffixed VITE_VAULT_FACTORY_ADDRESS as Base", () => {
		expect(factoryFor(BASE_CHAIN_ID, { VITE_VAULT_FACTORY_ADDRESS: FACTORY })).toBe(FACTORY);
	});

	/**
	 * The failure this prevents is subtle and expensive: an existing single-chain
	 * `.env` upgraded in place would otherwise enable *every* chain, all of them
	 * pointing at Base's factory address. Two of the three would find no contract
	 * there and the vault list would simply be empty, with nothing saying why.
	 */
	it("does not let the unsuffixed name leak onto the other chains", () => {
		expect(factoryFor(ARBITRUM_CHAIN_ID, { VITE_VAULT_FACTORY_ADDRESS: FACTORY })).toBeUndefined();
		expect(factoryFor(XLAYER_CHAIN_ID, { VITE_VAULT_FACTORY_ADDRESS: FACTORY })).toBeUndefined();
	});

	it("prefers the suffixed name for Base", () => {
		expect(
			factoryFor(BASE_CHAIN_ID, {
				VITE_VAULT_FACTORY_ADDRESS: OTHER,
				VITE_VAULT_FACTORY_ADDRESS_BASE: FACTORY,
			}),
		).toBe(FACTORY);
	});
});
