import { describe, expect, it } from "bun:test";
import { leverageBps, toUnits, ValuationError, value } from "../src/valuation";

const USDC = 1_000_000n;

function leg(overrides = {}) {
	return {
		ticker: "NVDA",
		spotTokenBalance: 10n * 10n ** 18n,
		spotTokenDecimals: 18,
		spotSellQuoteUsdc: 5_000n * USDC,
		...overrides,
	};
}

function inputs(overrides: Record<string, unknown> = {}) {
	return {
		legs: [leg()],
		perpEquityUsdc: 5_000n * USDC,
		perpNotionalUsdc: 5_000n * USDC,
		idleAtAgentUsdc: 0n,
		inFlightUsdc: 0n,
		...overrides,
	};
}

describe("value", () => {
	it("totals every component", () => {
		const v = value(inputs({ idleAtAgentUsdc: 100n * USDC, inFlightUsdc: 250n * USDC }));
		expect(v.deployedAssets).toBe(10_350n * USDC);
		expect(v.components.spot).toBe(5_000n * USDC);
		expect(v.components.inFlight).toBe(250n * USDC);
	});

	/**
	 * Money mid-bridge belongs to neither chain for a few minutes. Omitting it
	 * would make every deployment read as an instant loss of that size.
	 */
	it("counts value that is mid-bridge", () => {
		const without = value(inputs()).deployedAssets;
		const withFlight = value(inputs({ inFlightUsdc: 1_000n * USDC })).deployedAssets;
		expect(withFlight - without).toBe(1_000n * USDC);
	});

	it("counts USDC sitting at the agent's own wallet", () => {
		expect(value(inputs({ idleAtAgentUsdc: 900n * USDC })).deployedAssets).toBe(10_900n * USDC);
	});

	/**
	 * The important refusal. A vault whose spot pool has dried up is worth an
	 * unknown amount, not its perp equity — reporting the knowable part as the
	 * whole would mark every holder down by the entire spot leg.
	 */
	it("refuses to price a spot leg it cannot route", () => {
		expect(() => value(inputs({ legs: [leg({ spotSellQuoteUsdc: null })] }))).toThrow(
			ValuationError,
		);
	});

	it("is happy with no spot leg at all", () => {
		const v = value(inputs({ legs: [leg({ spotTokenBalance: 0n, spotSellQuoteUsdc: null })] }));
		expect(v.deployedAssets).toBe(5_000n * USDC);
	});

	/** An executable sell quote, not a mid — the difference is what a thin pool costs. */
	it("values the spot leg at what a sale would clear", () => {
		const v = value(inputs({ legs: [leg({ spotSellQuoteUsdc: 4_700n * USDC })] }));
		expect(v.components.spot).toBe(4_700n * USDC);
		expect(v.deployedAssets).toBe(9_700n * USDC);
	});
});

describe("value, across several markets", () => {
	const three = [
		leg({ ticker: "BTC", spotSellQuoteUsdc: 4_000n * USDC }),
		leg({ ticker: "ETH", spotSellQuoteUsdc: 3_000n * USDC }),
		leg({ ticker: "NVDA", spotSellQuoteUsdc: 1_000n * USDC }),
	];

	it("adds the spot legs up and breaks them down by market", () => {
		const v = value(inputs({ legs: three }));
		expect(v.components.spot).toBe(8_000n * USDC);
		expect(v.spotByMarket).toEqual({
			BTC: 4_000n * USDC,
			ETH: 3_000n * USDC,
			NVDA: 1_000n * USDC,
		});
	});

	/**
	 * The mistake this shape exists to make impossible. One Pacifica account, one
	 * Base wallet and one Solana wallet back every market, so a three-market vault
	 * built by summing three single-market valuations would report three times its
	 * margin and idle capital as NAV — and every holder's share price with it.
	 */
	it("counts the shared account once, not once per market", () => {
		const v = value(
			inputs({ legs: three, perpEquityUsdc: 6_000n * USDC, idleAtAgentUsdc: 500n * USDC }),
		);
		expect(v.components.perpEquity).toBe(6_000n * USDC);
		expect(v.components.idleAtAgent).toBe(500n * USDC);
		expect(v.deployedAssets).toBe(14_500n * USDC);
	});

	/**
	 * A NAV is one number for one share price. Four of five legs priced is not a
	 * rougher answer than five — it is a wrong one, and every holder is marked
	 * down by the missing leg while deposits are struck against them at that price.
	 */
	it("stales the whole vault when any one market cannot be priced", () => {
		expect(() =>
			value(
				inputs({
					legs: [three[0], three[1], leg({ ticker: "NVDA", spotSellQuoteUsdc: null })],
				}),
			),
		).toThrow(/NVDA/);
	});

	/** Leverage is an account-level fact, because that is what the venue margins. */
	it("levers the summed notional against the one equity", () => {
		const v = value(
			inputs({ legs: three, perpEquityUsdc: 4_000n * USDC, perpNotionalUsdc: 8_000n * USDC }),
		);
		expect(v.leverageBps).toBe(20_000);
	});
});

describe("leverageBps", () => {
	it("reads 1x when notional matches equity", () => {
		expect(leverageBps(5_000n * USDC, 5_000n * USDC)).toBe(10_000);
	});

	it("reads 3x when equity is a third of notional", () => {
		expect(leverageBps(3_000n * USDC, 1_000n * USDC)).toBe(30_000);
	});

	it("reads 1x with no position open", () => {
		expect(leverageBps(0n, 0n)).toBe(10_000);
	});

	/**
	 * Zero equity against an open notional is a position about to be liquidated.
	 * Reporting a huge number is correct and will be rejected by the contract,
	 * which is the right outcome — it is not something to round away.
	 */
	it("reports wiped equity as maximal rather than as fine", () => {
		expect(leverageBps(5_000n * USDC, 0n)).toBe(Number.MAX_SAFE_INTEGER);
	});
});

describe("toUnits", () => {
	it("leaves 18dp alone", () => {
		expect(toUnits(5n * 10n ** 18n, 18)).toBe(5n * 10n ** 18n);
	});

	it("scales a 6dp balance up", () => {
		expect(toUnits(5n * 10n ** 6n, 6)).toBe(5n * 10n ** 18n);
	});

	it("scales a 24dp balance down", () => {
		expect(toUnits(5n * 10n ** 24n, 24)).toBe(5n * 10n ** 18n);
	});

	/** Two legs at different decimals must compare as equal when they are equal. */
	it("makes differently-scaled legs comparable", () => {
		expect(toUnits(100n * 10n ** 8n, 8)).toBe(toUnits(100n * 10n ** 18n, 18));
	});
});
