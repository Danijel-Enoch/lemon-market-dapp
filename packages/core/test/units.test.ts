import { describe, expect, test } from "bun:test";
import {
	baseTickerToStockToken,
	isSameUnderlying,
	isTradableAssetClass,
	normalizePairSymbol,
	pairToBaseTicker,
	stockTokenToBaseTicker,
} from "../src/symbols";
import { fromBaseUnits, percentToBps, toBaseUnits } from "../src/units";

describe("base unit conversion", () => {
	test("USDC uses 6 decimals", () => {
		expect(toBaseUnits("100", 6)).toBe(100_000_000n);
		expect(fromBaseUnits(100_000_000n, 6)).toBe("100");
	});

	/**
	 * The Coinbase tokenized stocks are 8-decimal, not the 18 most ERC-20 code
	 * assumes. Treating one as the other misprices an order by 1e10.
	 */
	test("tokenized stocks use 8 decimals", () => {
		expect(toBaseUnits("1", 8)).toBe(100_000_000n);
		expect(toBaseUnits("1.11502743", 8)).toBe(111_502_743n);
		expect(fromBaseUnits(111_502_743n, 8)).toBe("1.11502743");
	});

	test("excess precision is truncated, never rounded up", () => {
		// Rounding up could size an order above the user's balance.
		expect(toBaseUnits("1.123456789", 8)).toBe(112_345_678n);
		expect(toBaseUnits("0.9999999999", 6)).toBe(999_999n);
	});

	test("round-trips through both directions", () => {
		// Compared as decimal strings, not via Number() — 1e-8 round-trips
		// through a float into exponent notation and would not match.
		for (const [value, decimals] of [
			["0.00000001", 8],
			["12345.6789", 8],
			["0.5", 6],
			["1000000", 6],
		] as const) {
			expect(fromBaseUnits(toBaseUnits(value, decimals), decimals)).toBe(value);
		}
	});

	test("handles empty and malformed input without throwing", () => {
		expect(toBaseUnits("", 6)).toBe(0n);
		expect(toBaseUnits(".", 6)).toBe(0n);
		expect(toBaseUnits("abc", 6)).toBe(0n);
	});

	test("handles negatives", () => {
		expect(toBaseUnits("-1.5", 6)).toBe(-1_500_000n);
		expect(fromBaseUnits(-1_500_000n, 6)).toBe("-1.5");
	});

	test("slippage percent maps to KyberSwap's bps range", () => {
		expect(percentToBps(0.1)).toBe(10);
		expect(percentToBps(1)).toBe(100);
		// Upstream rejects anything above 2000.
		expect(percentToBps(500)).toBe(2000);
		expect(percentToBps(-1)).toBe(0);
	});
});

describe("symbol handling", () => {
	test("pair symbols normalise across separators", () => {
		expect(normalizePairSymbol("nvda-usd")).toBe("NVDA/USD");
		expect(normalizePairSymbol("NVDA_USD")).toBe("NVDA/USD");
		expect(normalizePairSymbol("NVDA/USD")).toBe("NVDA/USD");
	});

	test("USD-quoted pairs reduce to the base ticker", () => {
		expect(pairToBaseTicker("NVDA/USD")).toBe("NVDA");
	});

	test("non-USD quotes are kept whole", () => {
		// The quote currency carries meaning when it is not USD.
		expect(pairToBaseTicker("USD/JPY")).toBe("USD/JPY");
		// A USD-quoted FX major reduces like an equity does. That is acceptable
		// because this helper only feeds stock-token matching; FX branches on
		// asset class instead.
		expect(pairToBaseTicker("EUR/USD")).toBe("EUR");
	});

	test("stock token symbols convert both ways", () => {
		expect(stockTokenToBaseTicker("NVDAc")).toBe("NVDA");
		expect(stockTokenToBaseTicker("GOOGLc")).toBe("GOOGL");
		expect(baseTickerToStockToken("NVDA")).toBe("NVDAc");
	});

	test("non-token symbols are rejected rather than mangled", () => {
		expect(stockTokenToBaseTicker("USDC")).toBeNull();
		expect(stockTokenToBaseTicker("WETH")).toBeNull();
	});

	test("underlying matching pairs a token with its perp", () => {
		expect(isSameUnderlying("NVDA/USD", "NVDAc")).toBe(true);
		expect(isSameUnderlying("AAPL/USD", "NVDAc")).toBe(false);
	});

	test("every the reference design asset class is tradable; unknown ones are not", () => {
		// The catalog is gated on listing status upstream, not on an allowlist
		// here, so a newly listed class must not be silently dropped.
		for (const asset of ["equity", "fx", "crypto", "commodity", "metal", "index"]) {
			expect(isTradableAssetClass(asset)).toBe(true);
		}
		expect(isTradableAssetClass("unknown")).toBe(false);
		expect(isTradableAssetClass(undefined)).toBe(false);
	});
});
