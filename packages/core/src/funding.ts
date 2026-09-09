/**
 * Funding periods.
 *
 * A basis vault does not earn continuously. Its return is a funding payment,
 * and a funding payment happens at a settlement — a discrete moment when the
 * venue moves cash between the long and short sides of every open position.
 * Between two settlements a hedged book earns nothing at all: the spot leg and
 * the perp leg move against each other and cancel, which is the whole point of
 * holding them together.
 *
 * That makes the funding period the natural unit for two things that would
 * otherwise pick an arbitrary one:
 *
 *  - **What the agent reports.** A NAV posted twice inside one period states
 *    the same funding twice over and differs only by mark noise on two legs
 *    that are meant to cancel. Reporting once per period means every point in
 *    the series is a period's realised outcome rather than a snapshot of where
 *    the marks happened to be.
 *  - **What the chart draws.** A line with four points per hour is four times
 *    the ink for the same information, and the extra three are the noise.
 *
 * Pacifica settles hourly, on the hour, UTC — which is why funding is quoted
 * per hour everywhere else in this codebase (`fundingShortPercentPerHour`,
 * `annualizeFundingRate`). The interval is a parameter rather than a constant
 * baked into the arithmetic because it is a venue's choice, not a law: a venue
 * settling every eight hours is a configuration change here and nothing else.
 */

/** Pacifica settles funding every hour, aligned to the top of the UTC hour. */
export const PACIFICA_FUNDING_INTERVAL_SECONDS = 3600;

/**
 * The funding period this deployment runs on.
 *
 * One venue, so one interval. When a second venue with a different settlement
 * cadence is added, this becomes a lookup and every function below already
 * takes the interval it should be given.
 */
export const FUNDING_INTERVAL_SECONDS = PACIFICA_FUNDING_INTERVAL_SECONDS;

/**
 * The start of the funding period a timestamp falls in, in seconds.
 *
 * Aligned to the epoch rather than to the caller's clock, which for an hourly
 * interval is the top of the UTC hour — the boundary the venue itself settles
 * on. An interval measured from "now" would drift a little every restart and
 * put the same payment in two different buckets on either side of one.
 */
export function fundingPeriodStart(
	timestamp: number,
	intervalSeconds: number = FUNDING_INTERVAL_SECONDS,
): number {
	if (!Number.isFinite(timestamp) || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
		return 0;
	}
	return Math.floor(timestamp / intervalSeconds) * intervalSeconds;
}

/** The next settlement at or after `timestamp`, in seconds. */
export function nextFundingSettlement(
	timestamp: number,
	intervalSeconds: number = FUNDING_INTERVAL_SECONDS,
): number {
	const interval = intervalSeconds > 0 && Number.isFinite(intervalSeconds) ? intervalSeconds : 0;
	return fundingPeriodStart(timestamp, intervalSeconds) + interval;
}

/**
 * Whether a settlement has landed between two moments.
 *
 * The question the agent asks each tick: "has the venue paid funding since I
 * last spoke?" A plain elapsed-time comparison cannot answer it — an hour
 * apart can sit either side of a settlement or wholly inside two adjacent
 * periods, and only the boundary distinguishes them.
 */
export function crossedFundingSettlement(
	since: number,
	now: number,
	intervalSeconds: number = FUNDING_INTERVAL_SECONDS,
): boolean {
	return fundingPeriodStart(now, intervalSeconds) > fundingPeriodStart(since, intervalSeconds);
}

/**
 * Thin a time series to its last observation in each funding period.
 *
 * The last rather than the first: it is the one closest to the settlement that
 * closes the period, so it carries the most of that period's funding. Series
 * recorded before a venue's cadence was adopted — or thickened by a keepalive
 * — collapse to one point per period without the caller having to know which
 * points came from where.
 *
 * Input order is not assumed and the result is ascending by timestamp, because
 * a chart that plots an unsorted series draws a line back on itself.
 */
export function lastPerFundingPeriod<T>(
	items: readonly T[],
	timestampOf: (item: T) => number,
	intervalSeconds: number = FUNDING_INTERVAL_SECONDS,
): T[] {
	const latest = new Map<number, T>();

	for (const item of items) {
		const at = timestampOf(item);
		if (!Number.isFinite(at)) continue;

		const period = fundingPeriodStart(at, intervalSeconds);
		const held = latest.get(period);
		if (held === undefined || at >= timestampOf(held)) latest.set(period, item);
	}

	return [...latest.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
}
