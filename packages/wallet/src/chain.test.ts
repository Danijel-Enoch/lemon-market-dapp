import { describe, expect, test } from "bun:test";
import { base, baseSepolia } from "viem/chains";
import { buildChain } from "./chain";

/**
 * These cover the cases that decide whether a wallet can *add* the chain.
 *
 * A chain object missing a name, a native currency or an RPC URL is rejected by
 * `wallet_addEthereumChain` with an error most wallets do not surface, so the
 * app would look like it connected and then fail every write. That failure is
 * invisible in a browser test and obvious here.
 */
describe("buildChain", () => {
	test("defaults to Base mainnet when nothing is configured", () => {
		expect(buildChain({}).id).toBe(base.id);
	});

	test("resolves a known testnet from its id alone", () => {
		const chain = buildChain({ VITE_CHAIN_ID: "84532" });
		expect(chain.id).toBe(baseSepolia.id);
		expect(chain.rpcUrls.default.http[0]).toBeTruthy();
	});

	test("knows Vibenet, which viem does not", () => {
		const chain = buildChain({ VITE_CHAIN_ID: "84538453" });
		expect(chain.id).toBe(84_538_453);
		expect(chain.name).toBe("Base Vibenet");
		expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.vibes.base.org");
	});

	test("builds an unknown chain from an id and an RPC URL", () => {
		const chain = buildChain({
			VITE_CHAIN_ID: "31337",
			VITE_CHAIN_NAME: "Anvil",
			VITE_CHAIN_RPC_URL: "http://127.0.0.1:8545",
			VITE_CHAIN_EXPLORER_URL: "https://example.test",
		});
		expect(chain.id).toBe(31_337);
		expect(chain.name).toBe("Anvil");
		expect(chain.rpcUrls.default.http[0]).toBe("http://127.0.0.1:8545");
		expect(chain.blockExplorers?.default.url).toBe("https://example.test");
	});

	test("an unknown id with no RPC URL falls back rather than building something unusable", () => {
		// There is nothing to connect to and nothing a wallet could add. Falling
		// back keeps the app rendering; the alternative is a chain object that
		// every wallet silently rejects.
		expect(buildChain({ VITE_CHAIN_ID: "999999" }).id).toBe(base.id);
	});

	test("overrides Base's RPC without losing its identity — the fork case", () => {
		const chain = buildChain({
			VITE_CHAIN_ID: "8453",
			VITE_CHAIN_NAME: "Base Fork (local)",
			VITE_CHAIN_RPC_URL: "http://127.0.0.1:8545",
		});
		expect(chain.id).toBe(base.id);
		expect(chain.name).toBe("Base Fork (local)");
		expect(chain.rpcUrls.default.http[0]).toBe("http://127.0.0.1:8545");
		expect(chain.nativeCurrency.symbol).toBe("ETH");
	});

	test("still honours the older VITE_BASE_RPC_URL", () => {
		const chain = buildChain({ VITE_BASE_RPC_URL: "https://rpc.example.test" });
		expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.example.test");
	});

	test("every built chain carries what wallet_addEthereumChain requires", () => {
		for (const source of [
			{},
			{ VITE_CHAIN_ID: "84532" },
			{ VITE_CHAIN_ID: "84538453" },
			{ VITE_CHAIN_ID: "31337", VITE_CHAIN_RPC_URL: "http://127.0.0.1:8545" },
		]) {
			const chain = buildChain(source);
			expect(chain.name).toBeTruthy();
			expect(chain.nativeCurrency.symbol).toBeTruthy();
			expect(chain.nativeCurrency.decimals).toBe(18);
			expect(chain.rpcUrls.default.http[0]).toMatch(/^https?:\/\//);
		}
	});
});
