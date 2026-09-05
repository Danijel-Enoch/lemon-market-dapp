import { describe, expect, it } from "bun:test";
import { base } from "viem/chains";
import { buildChain } from "./chain";

/**
 * The chain is not configurable; the endpoint is.
 *
 * These tests exist to keep that distinction from eroding. A future variable
 * that repointed the app at another chain id would let a build render against a
 * network where every vault write reverts, so the only thing the environment is
 * allowed to change here is which door onto Base mainnet the app knocks on.
 */
describe("buildChain", () => {
	it("is Base mainnet with no configuration", () => {
		expect(buildChain({}).id).toBe(base.id);
	});

	it("overrides only the RPC endpoint", () => {
		const chain = buildChain({ VITE_CHAIN_RPC_URL: "https://rpc.example.test" });
		expect(chain.id).toBe(base.id);
		expect(chain.name).toBe(base.name);
		expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.example.test");
	});

	it("still honours the older VITE_BASE_RPC_URL", () => {
		const chain = buildChain({ VITE_BASE_RPC_URL: "https://rpc.example.test" });
		expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.example.test");
	});

	it("prefers VITE_CHAIN_RPC_URL when both are set", () => {
		const chain = buildChain({
			VITE_CHAIN_RPC_URL: "https://new.example.test",
			VITE_BASE_RPC_URL: "https://old.example.test",
		});
		expect(chain.rpcUrls.default.http[0]).toBe("https://new.example.test");
	});

	it("ignores blank values rather than building an unusable transport", () => {
		const chain = buildChain({ VITE_CHAIN_RPC_URL: "   " });
		expect(chain.rpcUrls.default.http[0]).toBe(base.rpcUrls.default.http[0]);
	});

	it("keeps Base's canonical contracts, so wagmi still batches reads", () => {
		const chain = buildChain({ VITE_CHAIN_RPC_URL: "https://rpc.example.test" });
		expect(chain.contracts?.multicall3?.address).toBe(base.contracts.multicall3.address);
	});
});
