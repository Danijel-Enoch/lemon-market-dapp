import { describe, expect, it } from "bun:test";
import { DEFAULT_BASE_RPC_URLS, DEFAULT_RPC_URLS, resolveBaseRpc, resolveRpc } from "./rpc";

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

/**
 * The per-chain form. Same rules, one variable family per chain.
 *
 * The case worth protecting is the last one: a chain must never inherit another
 * chain's endpoints. An Arbitrum source pointed at a Base node backfills without
 * an error and serves an empty app, which is the failure mode this whole split
 * exists to prevent and the one a reader is most likely to "simplify" away.
 */
describe("resolveRpc", () => {
	it("reads each chain's own variables", () => {
		expect(resolveRpc("ARBITRUM", { PONDER_RPC_URL_ARBITRUM: "https://arb.example.test" })).toEqual(
			["https://arb.example.test"],
		);
		expect(resolveRpc("XLAYER", { XLAYER_RPC_URL: "https://okx.example.test" })).toEqual([
			"https://okx.example.test",
		]);
	});

	it("reads the suffixed name the rest of the deployment writes", () => {
		// `RPC_URL_XLAYER` is what `.env.example`, both compose files, the deploy
		// script and the agent all use. Reading only `XLAYER_RPC_URL` here meant a
		// deployment could configure a keyed endpoint everywhere, see it in three
		// processes, and have the indexer backfill from the public node anyway.
		expect(resolveRpc("XLAYER", { RPC_URL_XLAYER: "https://okx.example.test" })).toEqual([
			"https://okx.example.test",
		]);
		expect(resolveRpc("BASE", { RPC_URL_BASE: "https://base.example.test" })).toEqual([
			"https://base.example.test",
		]);
	});

	it("still lets the indexer's own endpoint replace the shared one", () => {
		expect(
			resolveRpc("XLAYER", {
				PONDER_RPC_URL_XLAYER: "https://dedicated.example.test",
				RPC_URL_XLAYER: "https://shared.example.test",
			}),
		).toEqual(["https://dedicated.example.test"]);
	});

	it("takes both spellings of the shared endpoint when a file carries both", () => {
		// Not a preference between them: an `.env` edited across the rename holds
		// both, they are usually two different nodes, and two buckets is more
		// backfill capacity than one. Identical values collapse in the dedupe.
		expect(
			resolveRpc("XLAYER", {
				RPC_URL_XLAYER: "https://new.example.test",
				XLAYER_RPC_URL: "https://old.example.test",
			}),
		).toEqual(["https://new.example.test", "https://old.example.test"]);
	});

	it("appends that chain's fallback list", () => {
		expect(
			resolveRpc("ARBITRUM", {
				ARBITRUM_RPC_URL: "https://one.example.test",
				ARBITRUM_RPC_FALLBACK_URLS: "https://two.example.test, https://three.example.test",
			}),
		).toEqual([
			"https://one.example.test",
			"https://two.example.test",
			"https://three.example.test",
		]);
	});

	it("falls back to that chain's public node, not to Base's", () => {
		expect(resolveRpc("XLAYER", {})).toEqual([...DEFAULT_RPC_URLS.XLAYER]);
		expect(resolveRpc("ARBITRUM", {})).toEqual([...DEFAULT_RPC_URLS.ARBITRUM]);
	});

	it("never inherits another chain's endpoints", () => {
		const baseOnly = {
			PONDER_RPC_URL_BASE: "https://base.example.test",
			RPC_URL_BASE: "https://base2.example.test",
			BASE_RPC_URL: "https://base3.example.test",
			BASE_RPC_FALLBACK_URLS: "https://base4.example.test",
		};
		expect(resolveRpc("ARBITRUM", baseOnly)).toEqual([...DEFAULT_RPC_URLS.ARBITRUM]);
		expect(resolveRpc("XLAYER", baseOnly)).toEqual([...DEFAULT_RPC_URLS.XLAYER]);
	});

	it("refuses a chain it has no default for rather than guessing", () => {
		expect(() => resolveRpc("SOLANA", {})).toThrow();
	});
});
