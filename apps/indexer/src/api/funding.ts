/** Seconds in a day. The bucket width, and the only unit in here. */
export const DAY = 86_400;

/** The columns of an `activity` row this needs. */
export interface FundingRow {
	/** When the venue settled, not when it was reported on Base. */
	occurredAt: number;
	/** The payment, signed USDC base units. */
	pnlAssets: bigint;
}

export interface FundingBucket {
	/** Unix seconds at UTC midnight — the bucket, not a settlement time. */
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
): FundingWindow {
	const byDay = new Map<number, { amount: bigint; settlements: number }>();

	for (const row of rows) {
		const day = Math.floor(row.occurredAt / DAY) * DAY;
		const bucket = byDay.get(day) ?? { amount: 0n, settlements: 0 };
		bucket.amount += row.pnlAssets;
		bucket.settlements += 1;
		byDay.set(day, bucket);
	}

	let cumulative = 0n;
	let settlements = 0;
	const points: FundingBucket[] = [];

	for (let day = since; day <= todayStart; day += DAY) {
		const bucket = byDay.get(day);
		cumulative += bucket?.amount ?? 0n;
		settlements += bucket?.settlements ?? 0;
		points.push({
			day,
			amount: bucket?.amount ?? 0n,
			settlements: bucket?.settlements ?? 0,
			cumulative,
		});
	}

	const today = byDay.get(todayStart);

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
