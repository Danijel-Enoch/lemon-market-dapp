import { describe, expect, it } from "bun:test";
import { DEFAULT_BASE_RPC_URLS, resolveBaseRpc } from "./rpc";

/**
 * Every case here is a way of ending up with one endpoint, or none.
 *
 * Those are the only outcomes that actually break: Ponder throttles a lone
 * bucket down to a few requests a second and then warns about it forever, and an
 * empty list is a chain with nowhere to read from. Nothing below is about
 * elegance — each test is a configuration that a deployment really produces.
 */
describe("resolveBaseRpc", () => {
	it("falls back to the public node when nothing is configured", () => {
		// One, deliberately — see `DEFAULT_BASE_RPC_URLS` for the endpoints that
		// were tried and why each of them fails the factory query. Extra capacity
		// has to be configured, because there is no free endpoint to default to.
		expect(resolveBaseRpc({})).toEqual([...DEFAULT_BASE_RPC_URLS]);
	});

	it("reads one variable as a list, so extra capacity needs no new variable", () => {
		expect(
			resolveBaseRpc({ PONDER_RPC_URL_BASE: "https://a.example.test,https://b.example.test" }),
		).toEqual(["https://a.example.test", "https://b.example.test"]);
	});

	it("tolerates the spacing a hand-edited .env has", () => {
		expect(
			resolveBaseRpc({
				PONDER_RPC_URL_BASE: " https://a.example.test , , https://b.example.test ",
			}),
		).toEqual(["https://a.example.test", "https://b.example.test"]);
	});

	it("treats an empty PONDER_RPC_URL_BASE as unset, not as a choice", () => {
		// Compose writes `${PONDER_RPC_URL_BASE:-}` for an unset variable, and `??`
		// would take that empty string over BASE_RPC_URL and configure no endpoint.
		expect(
			resolveBaseRpc({ PONDER_RPC_URL_BASE: "", BASE_RPC_URL: "https://a.example.test" }),
		).toEqual(["https://a.example.test"]);
		expect(
			resolveBaseRpc({ PONDER_RPC_URL_BASE: "  ", BASE_RPC_URL: "https://a.example.test" }),
		).toEqual(["https://a.example.test"]);
	});

	it("lets the indexer's own endpoint replace the app's shared one", () => {
		expect(
			resolveBaseRpc({
				PONDER_RPC_URL_BASE: "https://dedicated.example.test",
				BASE_RPC_URL: "https://shared.example.test",
			}),
		).toEqual(["https://dedicated.example.test"]);
	});

	it("still adds the chain-wide fallbacks to whichever primary won", () => {
		expect(
			resolveBaseRpc({
				PONDER_RPC_URL_BASE: "https://dedicated.example.test",
				BASE_RPC_URL: "https://shared.example.test",
				BASE_RPC_FALLBACK_URLS: "https://spare.example.test",
			}),
		).toEqual(["https://dedicated.example.test", "https://spare.example.test"]);

		expect(
			resolveBaseRpc({
				BASE_RPC_URL: "https://shared.example.test",
				BASE_RPC_FALLBACK_URLS: "https://spare.example.test",
			}),
		).toEqual(["https://shared.example.test", "https://spare.example.test"]);
	});

	it("does not count one node twice as two buckets of capacity", () => {
		expect(
			resolveBaseRpc({
				BASE_RPC_URL: "https://a.example.test",
				BASE_RPC_FALLBACK_URLS: "https://a.example.test,https://b.example.test",
			}),
		).toEqual(["https://a.example.test", "https://b.example.test"]);
	});

	it("never returns an empty list, whatever the environment holds", () => {
		expect(
			resolveBaseRpc({
				PONDER_RPC_URL_BASE: " , ",
				BASE_RPC_URL: "",
				BASE_RPC_FALLBACK_URLS: ",,",
			}),
		).toEqual([...DEFAULT_BASE_RPC_URLS]);
	});
});
