import { describe, expect, it } from "bun:test";
import {
	ARBITRUM_CHAIN_ID,
	allChains,
	BASE_CHAIN_ID,
	CHAIN_REGISTRY,
	chainByKey,
	chainInfo,
	explorerAddress,
	explorerToken,
	explorerTx,
	isSupportedChainId,
	requireChainInfo,
	SUPPORTED_CHAIN_IDS,
	USDC_ADDRESS,
	USDC_DECIMALS,
	usdcFor,
	XLAYER_CHAIN_ID,
} from "../src/chain";

/**
 * The registry is the keystone: every chain-specific decision in the app reads
 * from it, so a wrong entry here is wrong everywhere at once and in a way that
 * does not throw. These tests pin the properties the rest of the code assumes.
 */
describe("the chain registry", () => {
	it("holds exactly the chains this build supports", () => {
		expect(SUPPORTED_CHAIN_IDS).toEqual([BASE_CHAIN_ID, ARBITRUM_CHAIN_ID, XLAYER_CHAIN_ID]);
		expect(allChains().map((c) => c.key)).toEqual(["base", "arbitrum", "xlayer"]);
	});

	it("keys every entry by its own id", () => {
		// A copy-paste that left an entry's `id` pointing at its neighbour would
		// make `chainInfo(196)` return X Layer's key with Arbitrum's USDC.
		for (const id of SUPPORTED_CHAIN_IDS) {
			expect(CHAIN_REGISTRY[id].id).toBe(id);
		}
	});

	it("gives every chain a distinct key, suffix, USDC and explorer", () => {
		const chains = allChains();
		for (const field of ["key", "envSuffix", "usdc", "explorerUrl"] as const) {
			const values = chains.map((c) => c[field]);
			expect(new Set(values).size).toBe(chains.length);
		}
	});

	/**
	 * Six decimals is assumed by every amount in the system — balances are stored
	 * and formatted as 6dp USDC throughout. A chain quoting in 18 would have every
	 * figure in the app wrong by 10^12, with no arithmetic error to catch it.
	 */
	it("quotes every chain in a six-decimal asset", () => {
		for (const chain of allChains()) {
			expect(chain.usdcDecimals).toBe(6);
			expect(usdcFor(chain.id)).toBe(chain.usdc);
		}
		expect(USDC_DECIMALS).toBe(6);
	});

	it("keeps USDC_ADDRESS meaning Base", () => {
		// The spot registry, the Relay client and the bridge all read this name
		// and all mean Base. Repointing it would silently move the spot leg.
		expect(USDC_ADDRESS).toBe(CHAIN_REGISTRY[BASE_CHAIN_ID].usdc);
	});

	/**
	 * X Layer charges gas in OKB. This is the one place that fact is recorded,
	 * and the gas panel, the agent's top-up warnings and the deploy script's
	 * "bridge gas first" message all read it.
	 */
	it("records the native gas token, which is not always ETH", () => {
		expect(CHAIN_REGISTRY[XLAYER_CHAIN_ID].nativeSymbol).toBe("OKB");
		expect(CHAIN_REGISTRY[BASE_CHAIN_ID].nativeSymbol).toBe("ETH");
		expect(CHAIN_REGISTRY[ARBITRUM_CHAIN_ID].nativeSymbol).toBe("ETH");
	});
});

describe("lookups", () => {
	it("accepts an id as a number or a string, because URLs carry strings", () => {
		expect(isSupportedChainId(8453)).toBe(true);
		expect(isSupportedChainId("8453")).toBe(true);
		expect(chainInfo("196")?.key).toBe("xlayer");
	});

	it("rejects anything not in the registry rather than defaulting", () => {
		expect(isSupportedChainId(1)).toBe(false);
		expect(isSupportedChainId(undefined)).toBe(false);
		expect(isSupportedChainId("")).toBe(false);
		expect(chainInfo(1)).toBeNull();
	});

	/**
	 * `requireChainInfo` is used wherever an unknown id is a configuration
	 * mistake. Throwing is the feature: defaulting to Base would write one
	 * chain's transactions against another chain's addresses, successfully.
	 */
	it("throws with the known chains named, rather than falling back", () => {
		expect(() => requireChainInfo(1)).toThrow(/Base \(8453\)/);
		expect(() => requireChainInfo(undefined)).toThrow();
	});

	it("finds a chain by key", () => {
		expect(chainByKey("arbitrum")?.id).toBe(ARBITRUM_CHAIN_ID);
		expect(chainByKey("mainnet")).toBeNull();
	});
});

/**
 * Explorer links take the chain first and have no default, so an un-migrated
 * call site is a type error rather than a Basescan link for an Arbitrum hash —
 * which would resolve to a plausible "not found" page rather than an error.
 */
describe("explorer links", () => {
	it("points at each chain's own explorer", () => {
		expect(explorerTx(BASE_CHAIN_ID, "0xabc")).toBe("https://basescan.org/tx/0xabc");
		expect(explorerTx(ARBITRUM_CHAIN_ID, "0xabc")).toBe("https://arbiscan.io/tx/0xabc");
		expect(explorerAddress(XLAYER_CHAIN_ID, "0xdef")).toBe(
			"https://www.oklink.com/xlayer/address/0xdef",
		);
	});

	it("scopes a token link to a holder when given one", () => {
		expect(explorerToken(BASE_CHAIN_ID, "0xtoken")).toBe("https://basescan.org/token/0xtoken");
		expect(explorerToken(BASE_CHAIN_ID, "0xtoken", "0xowner")).toBe(
			"https://basescan.org/token/0xtoken?a=0xowner",
		);
	});

	it("refuses an unknown chain rather than building a broken link", () => {
		expect(() => explorerTx(1, "0xabc")).toThrow();
	});
});
