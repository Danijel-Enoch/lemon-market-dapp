import { describe, expect, it } from "bun:test";
import { FUNDING_INTERVAL_SECONDS } from "@lemon/core";
import { type FundingReading, fundingPayments, type Watermark } from "../src/funding";

/**
 * The venue reports a running total; the feed needs the payments that made it.
 *
 * Everything here is about the subtraction between two readings, and every case
 * is one where getting it wrong publishes a plausible-looking wrong number
 * on-chain rather than throwing. A missed sign turns income into a loss, a
 * missed reset turns a reopened position into a five-figure negative payment,
 * and both are permanent once reported.
 */

const NOW = 1_760_000_000;
/** NOW rounded down to the settlement it falls in. */
const PERIOD = Math.floor(NOW / FUNDING_INTERVAL_SECONDS) * FUNDING_INTERVAL_SECONDS;
const OPENED = 1_759_000_000;

function reading(overrides: Partial<FundingReading> = {}): FundingReading {
	return {
		ticker: "NVDA",
		perpSymbol: "NVDA",
		accruedUsdc: 0n,
		positionOpenedAt: OPENED,
		notionalUsdc: 10_000_000n,
		...overrides,
	};
}

function watermarks(entries: Array<[string, Watermark]> = []): Map<string, Watermark> {
	return new Map(entries);
}

describe("fundingPayments", () => {
	it("reports the difference between two readings, not the total", () => {
		const { entries } = fundingPayments(
			[reading({ accruedUsdc: 130_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries).toHaveLength(1);
		expect(entries[0].pnlAssets).toBe(30_000n);
		expect(entries[0].kind).toBe("FUNDING_SETTLED");
	});

	it("baselines the first reading instead of crediting it as a payment", () => {
		// The total on a position first seen after a restart accrued while nobody
		// was watching. Reporting it would credit this period with all of it.
		const { entries, marks } = fundingPayments(
			[reading({ accruedUsdc: 500_000n })],
			watermarks(),
			NOW,
		);

		expect(entries).toHaveLength(0);
		expect(marks).toEqual([
			{ perpSymbol: "NVDA", mark: { accruedUsdc: 500_000n, positionOpenedAt: OPENED } },
		]);
	});

	it("reports a period the short paid for as a loss, not as income", () => {
		const { entries } = fundingPayments(
			[reading({ accruedUsdc: 90_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries[0].pnlAssets).toBe(-10_000n);
	});

	it("does not subtract across a position that closed and reopened", () => {
		// The new position's total starts from its own zero. Subtracting the old
		// watermark from it would report the whole of the old position's funding
		// history as one enormous negative payment.
		const { entries, marks } = fundingPayments(
			[reading({ accruedUsdc: 2_000n, positionOpenedAt: OPENED + 50_000 })],
			watermarks([["NVDA", { accruedUsdc: 900_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries).toHaveLength(0);
		expect(marks[0].mark.positionOpenedAt).toBe(OPENED + 50_000);
	});

	it("says nothing on a tick between settlements", () => {
		// Most ticks. Funding only moves when the venue settles, and an hourly
		// row saying nothing moved is a feed nobody reads.
		const { entries, marks } = fundingPayments(
			[reading({ accruedUsdc: 100_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries).toHaveLength(0);
		// The watermark is still returned, so a commit is idempotent rather than
		// dropping the mark on a quiet tick.
		expect(marks).toHaveLength(1);
	});

	it("skips a market with no position rather than reading it as zero", () => {
		const { entries, marks } = fundingPayments(
			[reading({ accruedUsdc: null, positionOpenedAt: null })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries).toHaveLength(0);
		// Deliberately not overwritten: a vault between deployments should resume
		// against what it last saw.
		expect(marks).toHaveLength(0);
	});

	it("keeps each market's watermark to itself", () => {
		const { entries } = fundingPayments(
			[
				reading({ ticker: "NVDA", perpSymbol: "NVDA", accruedUsdc: 110_000n }),
				reading({ ticker: "TSLA", perpSymbol: "TSLA", accruedUsdc: 40_000n }),
			],
			watermarks([
				["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }],
				["TSLA", { accruedUsdc: 25_000n, positionOpenedAt: OPENED }],
			]),
			NOW,
		);

		expect(entries.map((e) => [e.symbol, e.pnlAssets])).toEqual([
			["NVDA", 10_000n],
			["TSLA", 15_000n],
		]);
	});

	it("dates a payment to the settlement that produced it, not to the tick", () => {
		const { entries } = fundingPayments(
			[reading({ accruedUsdc: 130_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries[0].occurredAt).toBe(PERIOD);
		expect(entries[0].occurredAt).toBeLessThanOrEqual(NOW);
	});

	it("carries no transaction reference and no fee", () => {
		// Funding is a balance change the venue applies to every open position at
		// once. Inventing a txRef would put a hash in the feed that no explorer
		// resolves, and the venue charges nothing for settling it.
		const { entries } = fundingPayments(
			[reading({ accruedUsdc: 130_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries[0].txRef).toBe("0x");
		expect(entries[0].feeAssets).toBe(0n);
		expect(entries[0].baseAmount).toBe(0n);
	});

	it("reports every period once when ticks are missed", () => {
		// An outage that spanned three settlements leaves one large difference,
		// and it is still owed in full. Nothing here is per-period, which is why.
		const { entries } = fundingPayments(
			[reading({ accruedUsdc: 400_000n })],
			watermarks([["NVDA", { accruedUsdc: 100_000n, positionOpenedAt: OPENED }]]),
			NOW,
		);

		expect(entries[0].pnlAssets).toBe(300_000n);
	});
});
