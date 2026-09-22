/** Seconds in a day. The default bucket width. */
export const DAY = 86_400;

/**
 * Seconds in an hour, and the finest bucket worth offering.
 *
 * Pacifica settles funding on the hour, so an hour is the atom this data comes
 * in — bucketing finer would draw twenty-three empty columns between every
 * payment and invite a reader to conclude the vault had stopped earning.
 */
export const HOUR = 3_600;

/** The columns of an `activity` row this needs. */
export interface FundingRow {
	/** When the venue settled, not when it was reported on Base. */
	occurredAt: number;
	/** The payment, signed USDC base units. */
	pnlAssets: bigint;
}

export interface FundingBucket {
	/**
	 * Unix seconds at the start of the bucket — not a settlement time.
	 *
	 * `day` is the same number under its original name, kept because a browser
	 * bundle from before hourly buckets existed reads it, and a deployment runs
	 * a new API against an old bundle for the length of a rollout.
	 */
	start: number;
	/** @deprecated Read `start`. Identical value; retained for older bundles. */
	day: number;
	amount: bigint;
	settlements: number;
	/** Running total from the start of the window. */
	cumulative: bigint;
}

export interface FundingWindow {
	points: FundingBucket[];
	today: bigint;
	todaySettlements: number;
	windowTotal: bigint;
	settlements: number;
}

/**
 * Funding settlements, gathered into the days they landed in.
 *
 * Three decisions, each of which would be a wrong-looking chart if made the
 * other way:
 *
 *  - **Summed, not thinned.** The NAV chart keeps the last point in each period
 *    because its points are snapshots of one value and the others are
 *    redundant. These are not — each row is money that arrived once, and a vault
 *    running three markets is paid three times a period. Keeping the last would
 *    silently throw away two thirds of the vault's income.
 *  - **Every day, paid or not.** A day with no settlements is present with a
 *    zero. Building the series only from days that have rows would draw an
 *    outage as no gap at all, spacing the day before it evenly against the day
 *    after and hiding that anything was missed.
 *  - **UTC.** The venue settles on the UTC hour, so a local-day bucket would
 *    split one venue day across two columns, differently for every reader.
 *
 * `todayStart` is passed in rather than read from the clock so this is a pure
 * function of its inputs — which is what makes the boundary cases below
 * testable at all.
 */
export function bucketFunding(
	rows: FundingRow[],
	since: number,
	todayStart: number,
	width: number = DAY,
): FundingWindow {
	const byBucket = new Map<number, { amount: bigint; settlements: number }>();

	for (const row of rows) {
		const start = Math.floor(row.occurredAt / width) * width;
		const bucket = byBucket.get(start) ?? { amount: 0n, settlements: 0 };
		bucket.amount += row.pnlAssets;
		bucket.settlements += 1;
		byBucket.set(start, bucket);
	}

	let cumulative = 0n;
	let settlements = 0;
	const points: FundingBucket[] = [];

	for (let start = since; start <= todayStart; start += width) {
		const bucket = byBucket.get(start);
		cumulative += bucket?.amount ?? 0n;
		settlements += bucket?.settlements ?? 0;
		points.push({
			start,
			day: start,
			amount: bucket?.amount ?? 0n,
			settlements: bucket?.settlements ?? 0,
			cumulative,
		});
	}

	const today = byBucket.get(todayStart);

	return {
		points,
		// Partial by construction: the day is still being paid into.
		today: today?.amount ?? 0n,
		todaySettlements: today?.settlements ?? 0,
		windowTotal: cumulative,
		// Counted off the buckets rather than off `rows.length`, so a row that
		// fell outside the window cannot inflate a total the points do not show.
		settlements,
	};
}
