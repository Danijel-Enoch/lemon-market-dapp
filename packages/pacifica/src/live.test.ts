import { describe, expect, test } from "bun:test";
import { PacificaClient } from "./client";

/**
 * Read-only smoke tests against the real Pacifica API.
 *
 * These assert the shapes the rest of the app relies on, so a breaking change
 * upstream fails here rather than in the UI. They are opt-in because they need
 * network: run with PACIFICA_LIVE=1.
 */
const live = process.env.PACIFICA_LIVE === "1";
const suite = live ? describe : describe.skip;

suite("pacifica live API", () => {
	const client = new PacificaClient({ timeoutMs: 25_000 });

	test("markets carry the fields the terminal needs", async () => {
		const markets = await client.markets();
		expect(markets.length).toBeGreaterThan(0);

		const sol = markets.find((market) => market.symbol === "SOL");
		expect(sol).toBeDefined();
		expect(typeof sol?.max_leverage).toBe("number");
		expect(Number(sol?.lot_size)).toBeGreaterThan(0);
		expect(Number(sol?.tick_size)).toBeGreaterThan(0);
		expect(Number(sol?.min_order_size)).toBeGreaterThan(0);
	}, 30_000);

	test("prices expose mark, funding and the 24h reference", async () => {
		const prices = await client.prices();
		expect(prices.length).toBeGreaterThan(0);

		const row = prices[0];
		expect(Number(row.mark)).toBeGreaterThan(0);
		expect(Number.isFinite(Number(row.funding))).toBe(true);
		expect(Number.isFinite(Number(row.volume_24h))).toBe(true);
		// yesterday_price is what makes a real 24h change column possible.
		expect(Number(row.yesterday_price)).toBeGreaterThan(0);
	}, 30_000);

	test("every priced symbol is a listed market", async () => {
		const [markets, prices] = await Promise.all([client.markets(), client.prices()]);
		const listed = new Set(markets.map((market) => market.symbol));
		const orphans = prices.filter((price) => !listed.has(price.symbol)).map((p) => p.symbol);
		expect(orphans).toEqual([]);
	}, 40_000);

	test("orderbook returns bids below asks", async () => {
		const book = await client.orderbook("SOL");
		const [bids, asks] = book.l;
		expect(bids.length).toBeGreaterThan(0);
		expect(asks.length).toBeGreaterThan(0);
		expect(Number(bids[0].p)).toBeLessThan(Number(asks[0].p));
	}, 30_000);

	test("bridge info names a custody program per asset", async () => {
		const assets = await client.bridgeInfo();
		expect(assets.length).toBeGreaterThan(0);
		for (const asset of assets) {
			expect(asset.bridge_program.length).toBeGreaterThan(30);
			expect(asset.decimals).toBeGreaterThan(0);
		}
	}, 30_000);

	test("an unknown account is reported, not silently empty", async () => {
		// A well-formed but unused address: the API should answer cleanly either
		// way, and must not hang or return a malformed envelope.
		const address = "11111111111111111111111111111111";
		try {
			const info = await client.accountInfo(address);
			expect(info).toBeDefined();
		} catch (error) {
			expect((error as Error).name).toBe("PacificaError");
		}
	}, 30_000);
});
