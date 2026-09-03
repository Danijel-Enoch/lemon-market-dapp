import { describe, expect, test } from "bun:test";
import {
	classifyPacificaSymbol,
	findMarket,
	fundingToApr,
	joinMarkets,
	toDisplaySymbol,
	toPacificaSymbol,
} from "./catalog";
import { PacificaClient } from "./client";
import type { PacificaMarketInfo, PacificaPrice } from "./types";

const info = (over: Partial<PacificaMarketInfo> = {}): PacificaMarketInfo => ({
	symbol: "BTC",
	tick_size: "0.1",
	min_tick: "0",
	max_tick: "1000000",
	lot_size: "0.0001",
	max_leverage: 50,
	isolated_only: false,
	min_order_size: "10",
	max_order_size: "5000000",
	funding_rate: "0.0000125",
	next_funding_rate: "0.00001",
	created_at: 1,
	instrument_type: "perpetual",
	base_asset: "BTC",
	execution_modes: ["orderbook"],
	...over,
});

const price = (over: Partial<PacificaPrice> = {}): PacificaPrice => ({
	symbol: "BTC",
	mark: "110",
	mid: "109.9",
	oracle: "110.1",
	funding: "0.0000125",
	next_funding: "0.00001",
	open_interest: "1000",
	volume_24h: "50000",
	yesterday_price: "100",
	timestamp: 1,
	...over,
});

describe("classification", () => {
	test("groups each family", () => {
		expect(classifyPacificaSymbol("BTC")).toBe("crypto");
		expect(classifyPacificaSymbol("NVDA")).toBe("equity");
		expect(classifyPacificaSymbol("XAU")).toBe("metal");
		expect(classifyPacificaSymbol("CL")).toBe("commodity");
		expect(classifyPacificaSymbol("SP500")).toBe("index");
		expect(classifyPacificaSymbol("EURUSD")).toBe("fx");
	});

	test("falls back to crypto for an unlisted symbol", () => {
		// A newly listed token must still appear, just grouped as crypto.
		expect(classifyPacificaSymbol("SOMETHINGNEW")).toBe("crypto");
	});

	test("is case-insensitive", () => {
		expect(classifyPacificaSymbol("nvda")).toBe("equity");
	});
});

describe("symbol shapes", () => {
	test("appends a USD quote to a bare underlying", () => {
		expect(toDisplaySymbol("BTC")).toBe("BTC/USD");
	});

	test("splits an FX pair rather than appending USD", () => {
		expect(toDisplaySymbol("EURUSD")).toBe("EUR/USD");
		expect(toDisplaySymbol("USDJPY")).toBe("USD/JPY");
	});

	test("keeps an explicit quote", () => {
		expect(toDisplaySymbol("SOL-USDC")).toBe("SOL/USDC");
	});

	test("round-trips back to the wire symbol", () => {
		for (const symbol of ["BTC", "EURUSD", "USDJPY", "SOL-USDC", "kPEPE"]) {
			expect(toPacificaSymbol(toDisplaySymbol(symbol))).toBe(symbol.toUpperCase());
		}
	});

	test("accepts the route-param form", () => {
		expect(toPacificaSymbol("BTC-USD")).toBe("BTC");
		expect(toPacificaSymbol("btc/usd")).toBe("BTC");
	});
});

describe("joinMarkets", () => {
	test("joins static definition to live price", () => {
		const [market] = joinMarkets([info()], [price()]);
		expect(market.symbol).toBe("BTC/USD");
		expect(market.pacificaSymbol).toBe("BTC");
		expect(market.markPrice).toBe(110);
		expect(market.maxLeverage).toBe(50);
		expect(market.tickSize).toBe(0.1);
		expect(market.openInterest).toBe(1000);
		expect(market.volume24h).toBe(50000);
	});

	test("computes the 24h change from yesterday's close", () => {
		const [market] = joinMarkets([info()], [price({ mark: "110", yesterday_price: "100" })]);
		expect(market.change24hPercent).toBeCloseTo(10, 6);
	});

	test("reports a negative move", () => {
		const [market] = joinMarkets([info()], [price({ mark: "90", yesterday_price: "100" })]);
		expect(market.change24hPercent).toBeCloseTo(-10, 6);
	});

	/** A market listed today has no yesterday — that must not become Infinity. */
	test("returns null rather than dividing by a zero reference", () => {
		const [market] = joinMarkets([info()], [price({ yesterday_price: "0" })]);
		expect(market.change24hPercent).toBe(null);
	});

	test("keeps a market whose price row is missing", () => {
		const [market] = joinMarkets([info()], []);
		expect(market.symbol).toBe("BTC/USD");
		expect(market.markPrice).toBe(null);
		expect(market.change24hPercent).toBe(null);
		expect(market.openInterest).toBe(0);
	});

	test("matches rows by symbol, not by position", () => {
		const markets = joinMarkets(
			[info({ symbol: "BTC" }), info({ symbol: "ETH" })],
			[price({ symbol: "ETH", mark: "4000" }), price({ symbol: "BTC", mark: "100000" })],
		);
		expect(markets.find((m) => m.pacificaSymbol === "BTC")?.markPrice).toBe(100000);
		expect(markets.find((m) => m.pacificaSymbol === "ETH")?.markPrice).toBe(4000);
	});
});

describe("findMarket", () => {
	const markets = joinMarkets([info(), info({ symbol: "EURUSD" })], [price()]);

	test("resolves every symbol spelling", () => {
		for (const spelling of ["BTC", "btc", "BTC-USD", "BTC/USD"]) {
			expect(findMarket(markets, spelling)?.pacificaSymbol).toBe("BTC");
		}
	});

	test("resolves an FX pair", () => {
		expect(findMarket(markets, "EUR-USD")?.pacificaSymbol).toBe("EURUSD");
	});

	test("returns undefined for an unknown symbol", () => {
		expect(findMarket(markets, "NOPE")).toBeUndefined();
	});
});

test("fundingToApr annualises an hourly rate", () => {
	expect(fundingToApr(0.0000125)).toBeCloseTo(0.0000125 * 24 * 365 * 100, 9);
});

/* --------------------------------------------------------------- live check */

const live = process.env.PACIFICA_LIVE === "1";
(live ? describe : describe.skip)("against the live universe", () => {
	test("every listed market joins, classifies and round-trips", async () => {
		const client = new PacificaClient({ timeoutMs: 25_000 });
		const [info_, prices_] = await Promise.all([client.markets(), client.prices()]);
		const markets = joinMarkets(info_, prices_);

		// Nothing is dropped: the whole universe reaches the app.
		expect(markets.length).toBe(info_.length);

		for (const market of markets) {
			expect(market.symbol).toContain("/");
			expect(market.maxLeverage).toBeGreaterThan(0);
			expect(market.lotSize).toBeGreaterThan(0);
			expect(market.tickSize).toBeGreaterThan(0);
			// A route built from the display symbol must resolve back to this market.
			expect(findMarket(markets, market.symbol)?.pacificaSymbol).toBe(market.pacificaSymbol);
		}

		// Display symbols are unique, so they are safe as React keys and routes.
		expect(new Set(markets.map((m) => m.symbol)).size).toBe(markets.length);

		const byClass = new Map<string, number>();
		for (const market of markets) {
			byClass.set(market.assetClass, (byClass.get(market.assetClass) ?? 0) + 1);
		}
		// The thesis markets must all be represented.
		for (const kind of ["crypto", "equity", "fx", "metal", "commodity", "index"]) {
			expect(byClass.get(kind) ?? 0).toBeGreaterThan(0);
		}
		console.log("   live classes:", Object.fromEntries(byClass));
	}, 45_000);
});
