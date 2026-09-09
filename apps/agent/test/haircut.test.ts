import { describe, expect, it } from "bun:test";
import {
	atRatio,
	createHaircutTracker,
	executionRatio,
	haircutBps,
	markSpotLeg,
	markValueUsdc,
	median,
	RATIO_UNIT,
} from "../src/haircut";

const USDC = 1_000_000n;

/**
 * The live vault's numbers, which are what this module was written against.
 *
 * 0.07208767 NVDAc at eight decimals, a Pacifica mark of $224.788507, and a Kyber
 * quote of $16.032305 for the lot — a haircut of about 107 bps.
 */
const NVDA_BALANCE = 7_208_767n;
const NVDA_DECIMALS = 8;
const NVDA_MARK = 224.788507;
const NVDA_QUOTE = 16_032_305n;

function tracker(overrides = {}) {
	return createHaircutTracker({ window: 6, minSamples: 3, ...overrides });
}

/** Feed the tracker `count` identical samples so it is warm before the assertion. */
function warm(t: ReturnType<typeof tracker>, ratio: bigint, count = 3, from = 1_000) {
	for (let i = 0; i < count; i++) t.observe("NVDA", ratio, from + i);
}

describe("markValueUsdc", () => {
	it("prices a holding at the mark, across the token's own decimals", () => {
		// 0.07208767 × 224.788507 = 16.204479…
		expect(markValueUsdc(NVDA_BALANCE, NVDA_DECIMALS, NVDA_MARK)).toBe(16_204_479n);
	});

	it("is the same number however the token counts its decimals", () => {
		const eight = markValueUsdc(5n * 10n ** 8n, 8, 100);
		const eighteen = markValueUsdc(5n * 10n ** 18n, 18, 100);
		expect(eight).toBe(500n * USDC);
		expect(eighteen).toBe(500n * USDC);
	});

	/**
	 * Zero is "cannot be priced against a mark", not "worth nothing" — the caller
	 * reads it as a signal to fall back to the raw quote.
	 */
	it("answers zero for an unreadable mark rather than guessing", () => {
		expect(markValueUsdc(NVDA_BALANCE, NVDA_DECIMALS, 0)).toBe(0n);
		expect(markValueUsdc(NVDA_BALANCE, NVDA_DECIMALS, Number.NaN)).toBe(0n);
		expect(markValueUsdc(0n, NVDA_DECIMALS, NVDA_MARK)).toBe(0n);
	});
});

describe("executionRatio", () => {
	it("measures the live vault's haircut at about 107 bps", () => {
		const reference = markValueUsdc(NVDA_BALANCE, NVDA_DECIMALS, NVDA_MARK);
		expect(haircutBps(executionRatio(NVDA_QUOTE, reference) as bigint)).toBe(106);
	});

	it("round-trips a value back through the ratio", () => {
		const reference = 16_205_403n;
		const ratio = executionRatio(NVDA_QUOTE, reference) as bigint;
		// Within a unit of USDC's last decimal, which is the floor of the format.
		expect(atRatio(reference, ratio)).toBeGreaterThanOrEqual(NVDA_QUOTE - 1n);
		expect(atRatio(reference, ratio)).toBeLessThanOrEqual(NVDA_QUOTE);
	});

	it("refuses a reference it cannot divide by", () => {
		expect(executionRatio(NVDA_QUOTE, 0n)).toBeNull();
		expect(executionRatio(NVDA_QUOTE, -1n)).toBeNull();
	});
});

describe("median", () => {
	it("takes the middle of an odd window", () => {
		expect(median([3n, 1n, 2n])).toBe(2n);
	});

	/**
	 * The lower of the two middles, not their average — the answer has to be a
	 * ratio the pool actually quoted, and where they differ the lower one is the
	 * more conservative mark.
	 */
	it("takes the lower middle of an even one rather than interpolating", () => {
		expect(median([1n, 2n, 4n, 10n])).toBe(2n);
	});

	it("has nothing to say about no samples", () => {
		expect(median([])).toBeNull();
	});

	/**
	 * The reason this is a median and not a mean. A pool that quotes one level and
	 * jumps once should keep reporting the level, not carry a fraction of the jump
	 * into the NAV.
	 */
	it("ignores an excursion a mean would carry", () => {
		const flat = [100n, 100n, 100n, 100n, 1n];
		expect(median(flat)).toBe(100n);
	});
});

describe("createHaircutTracker", () => {
	it("says nothing until it has enough samples", () => {
		const t = tracker();
		t.observe("NVDA", RATIO_UNIT, 1_000);
		t.observe("NVDA", RATIO_UNIT, 1_060);
		expect(t.settled("NVDA", 1_060)).toBeNull();
		t.observe("NVDA", RATIO_UNIT, 1_120);
		expect(t.settled("NVDA", 1_120)).toBe(RATIO_UNIT);
	});

	it("keeps only the last window of samples", () => {
		const t = tracker({ window: 3 });
		for (let i = 0; i < 10; i++) t.observe("NVDA", RATIO_UNIT, 1_000 + i);
		expect(t.depth("NVDA", 1_010)).toBe(3);
	});

	/**
	 * A count window is only a time window while ticks are regular. An agent that
	 * was paused comes back holding samples measured against depth that has moved,
	 * and a median over those is the same staleness this module exists to remove.
	 */
	it("drops samples too old to mean anything", () => {
		const t = tracker({ maxAgeSeconds: 100 });
		warm(t, RATIO_UNIT, 3, 1_000);
		expect(t.settled("NVDA", 1_050)).toBe(RATIO_UNIT);
		expect(t.settled("NVDA", 5_000)).toBeNull();
		expect(t.depth("NVDA", 5_000)).toBe(0);
	});

	it("keeps each market's pool separate", () => {
		const t = tracker();
		warm(t, RATIO_UNIT, 3);
		expect(t.settled("SNDK", 1_003)).toBeNull();
		expect(t.settled("NVDA", 1_003)).toBe(RATIO_UNIT);
	});
});

describe("markSpotLeg", () => {
	const reference = markValueUsdc(NVDA_BALANCE, NVDA_DECIMALS, NVDA_MARK);
	const ratio = executionRatio(NVDA_QUOTE, reference) as bigint;

	function inputs(overrides = {}) {
		return {
			ticker: "NVDA",
			sellQuoteUsdc: NVDA_QUOTE as bigint | null,
			referenceUsdc: reference,
			at: 2_000,
			...overrides,
		};
	}

	/**
	 * The whole point. The mark moves, the pool does not, and the leg follows the
	 * mark — which is the only way it can cancel against a perp leg that does.
	 */
	it("moves the spot leg with the mark while the pool's quote is frozen", () => {
		const t = tracker();
		warm(t, ratio, 3);

		const flat = markSpotLeg(t, inputs());
		// The mark rises 1%; the pool has not traded, so the quote is unchanged.
		const risen = markSpotLeg(t, inputs({ referenceUsdc: (reference * 101n) / 100n, at: 2_060 }));

		expect(flat.basis).toBe("settled");
		expect(risen.basis).toBe("settled");
		expect(risen.valueUsdc).toBeGreaterThan(flat.valueUsdc as bigint);
		// Within a basis point of the mark's own 1% move.
		const moved =
			Number((risen.valueUsdc as bigint) - (flat.valueUsdc as bigint)) /
			Number(flat.valueUsdc as bigint);
		expect(moved).toBeGreaterThan(0.0099);
		expect(moved).toBeLessThan(0.0101);
	});

	/**
	 * The bug this replaced, stated as a test: a jumping quote against a still
	 * mark used to move NAV, and must not any more.
	 */
	it("holds the leg still while the pool's quote jumps around a still mark", () => {
		// The shipped window, because that is what makes the median stable — a
		// median over three samples of a jumpy series is itself jumpy.
		const t = tracker({ window: 60, minSamples: 10 });
		// The live vault's observed behaviour: the quote dwells at a level for
		// minutes — four consecutive reads of 222.579 against a moving mark — and
		// steps away from it now and then. Not a uniform cycle, which no pool
		// produces and which is the one input a median genuinely cannot settle on.
		const dwell = 16_045_203n;
		const excursions = [16_032_305n, 16_050_281n, 16_025_110n, 16_043_110n, 16_024_238n];
		const quoteAt = (i: number) =>
			i % 5 < 3 ? dwell : excursions[Math.floor(i / 5) % excursions.length];

		const values: bigint[] = [];
		for (let i = 0; i < 60; i++) {
			const mark = markSpotLeg(t, inputs({ sellQuoteUsdc: quoteAt(i), at: 2_000 + i * 60 }));
			// The first ticks are the warm-up, which is the raw quote by design.
			if (mark.basis === "settled" && i >= 20) values.push(mark.valueUsdc as bigint);
		}

		expect(values.length).toBeGreaterThan(30);
		const spread = Number(
			values.reduce((a, b) => (a > b ? a : b)) - values.reduce((a, b) => (a < b ? a : b)),
		);
		const rawSpread = Number(16_050_281n - 16_024_238n);
		// The raw quotes span $0.026 — the artifact this module exists to remove.
		expect(rawSpread / 1e6).toBeGreaterThan(0.025);
		// Held on the mark's clock, the leg moves by under a tenth of a cent.
		expect(spread / 1e6).toBeLessThan(0.001);
	});

	it("refuses a leg with no pool, exactly as before", () => {
		const t = tracker();
		warm(t, ratio, 3);
		const mark = markSpotLeg(t, inputs({ sellQuoteUsdc: null }));
		expect(mark.valueUsdc).toBeNull();
		expect(mark.basis).toBe("no-pool");
	});

	it("uses the raw quote when there is no mark to price against", () => {
		const t = tracker();
		const mark = markSpotLeg(t, inputs({ referenceUsdc: 0n }));
		expect(mark.valueUsdc).toBe(NVDA_QUOTE);
		expect(mark.basis).toBe("unmarked");
		// An unpriceable mark must not pollute the window either.
		expect(t.depth("NVDA", 2_000)).toBe(0);
	});

	it("uses the raw quote until the window is warm", () => {
		const t = tracker();
		const mark = markSpotLeg(t, inputs());
		expect(mark.valueUsdc).toBe(NVDA_QUOTE);
		expect(mark.basis).toBe("warming");
	});

	/**
	 * The catch for a pool that has genuinely dislocated. Marking off a
	 * comfortable median through that would report a vault richer than it can
	 * liquidate, which is the error the executable quote existed to prevent.
	 */
	it("believes the pool over the median when the two are far apart", () => {
		const t = tracker();
		warm(t, ratio, 3);
		// Half the value: a dislocation, not noise.
		const mark = markSpotLeg(t, inputs({ sellQuoteUsdc: NVDA_QUOTE / 2n }));
		expect(mark.valueUsdc).toBe(NVDA_QUOTE / 2n);
		expect(mark.basis).toBe("dislocated");
	});

	/**
	 * The band is a check on any one quote, not a filter that keeps reality out of
	 * the average — a pool that stays thin must become the new settled level.
	 */
	it("settles onto a new level once the pool stays there", () => {
		const t = tracker({ window: 6, minSamples: 3 });
		warm(t, ratio, 3);
		const thin = NVDA_QUOTE / 2n;
		let mark = markSpotLeg(t, inputs({ sellQuoteUsdc: thin, at: 2_100 }));
		expect(mark.basis).toBe("dislocated");

		for (let i = 0; i < 6; i++) {
			mark = markSpotLeg(t, inputs({ sellQuoteUsdc: thin, at: 2_200 + i * 60 }));
		}
		expect(mark.basis).toBe("settled");
		// Marked at the new, worse level rather than the comfortable old one.
		expect(mark.valueUsdc).toBeLessThan(NVDA_QUOTE);
		expect(mark.haircutBps as number).toBeGreaterThan(4_000);
	});

	it("prices an empty holding at nothing without recording a sample", () => {
		const t = tracker();
		const mark = markSpotLeg(t, inputs({ sellQuoteUsdc: 0n, referenceUsdc: 0n }));
		expect(mark.valueUsdc).toBe(0n);
		expect(mark.basis).toBe("unmarked");
		expect(t.depth("NVDA", 2_000)).toBe(0);
	});
});
