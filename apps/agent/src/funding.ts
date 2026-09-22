import { fundingPeriodStart } from "@lemon/core";
import { prisma } from "@lemon/db";
import type { ActivityInput } from "./vault";

/**
 * Turning the venue's funding total into the payments that made it.
 *
 * A basis vault has exactly one source of return, and until now it was the only
 * thing the agent did that left no trace. Every trade is reported on-chain —
 * spot buys, perp opens, rebalances, closes — and the feed can be audited
 * against the venues they name. Funding, the reason the vault exists, appeared
 * nowhere: it arrived inside the NAV as an unexplained increase, and a depositor
 * asking "how much has this vault actually earned from funding?" had nothing to
 * read. `FUNDING_SETTLED` has been in the contract's `ActivityKind` and in the
 * feed's filter chips since the beginning with nothing ever emitting it.
 *
 * The awkwardness is that the venue does not report payments. Pacifica reports a
 * running total on the open position, and the payment is the difference between
 * two readings of it — so the agent has to remember the previous reading, and
 * remember it somewhere that survives a restart. See `FundingWatermark`.
 *
 * Two things this deliberately does not do:
 *
 *  - **It does not wait for a settlement boundary.** It reports whatever the
 *    total has moved by since the last tick. Funding only moves at a settlement,
 *    so in practice that is one row per settlement per market anyway — but a
 *    tick that arrives late, or after an outage that spanned three settlements,
 *    still reports every dollar exactly once instead of the one period it
 *    happened to wake up in.
 *  - **It does not report a zero.** Most ticks are between settlements and have
 *    nothing to say, and a feed with an hourly row saying "no funding moved" is
 *    a feed nobody reads.
 */

/** One market's funding, as the venue currently reports it. */
export interface FundingReading {
	/** The vault's name for the market, which is what the activity row carries. */
	ticker: string;
	/** The venue's name for the perp, which is what the watermark is keyed by. */
	perpSymbol: string;
	/**
	 * Cumulative funding on the open position, signed USDC base units. Null when
	 * there is no position — which is not the same as zero, and is why the first
	 * reading after a deployment is a baseline rather than a payment.
	 */
	accruedUsdc: bigint | null;
	/** The venue's `created_at` for the position, or null when there is none. */
	positionOpenedAt: number | null;
	/** The position's notional, carried onto the row for context. */
	notionalUsdc: bigint;
}

/**
 * Payments to report, and the promise to remember that they were.
 *
 * Split in two because the watermark must not move until the report has landed.
 * Advancing it first and failing to report would consume the payment: the next
 * tick would subtract from the new total, find nothing owing, and that period's
 * funding would never appear anywhere. Reporting first and failing to advance
 * costs a duplicate row at worst, which is visible and fixable — so the failure
 * that gets chosen is the one that can be seen.
 */
export interface FundingSettlements {
	entries: ActivityInput[];
	/** Advance the watermarks. Call only once the entries are on-chain. */
	commit(): Promise<void>;
}

/** One market's last reading, as `fundingSettlements` stored it. */
export interface Watermark {
	accruedUsdc: bigint;
	positionOpenedAt: number;
}

/**
 * The arithmetic, with the database taken out of it.
 *
 * Separated so the rules below can be tested against a table of readings rather
 * than against Postgres — and they are the part worth testing. Getting a sign or
 * a reset wrong here does not throw; it publishes a wrong number on-chain, where
 * it is permanent.
 */
export function fundingPayments(
	readings: FundingReading[],
	previous: Map<string, Watermark>,
	now: number,
): { entries: ActivityInput[]; marks: Array<{ perpSymbol: string; mark: Watermark }> } {
	const entries: ActivityInput[] = [];
	const marks: Array<{ perpSymbol: string; mark: Watermark }> = [];

	for (const reading of readings) {
		// No position, no reading to take. The watermark is deliberately left
		// alone rather than cleared: a vault between two deployments should
		// resume against what it last saw, and the `positionOpenedAt` check
		// below is what decides whether that is still the same position.
		if (reading.accruedUsdc === null || reading.positionOpenedAt === null) continue;

		const mark: Watermark = {
			accruedUsdc: reading.accruedUsdc,
			positionOpenedAt: reading.positionOpenedAt,
		};
		marks.push({ perpSymbol: reading.perpSymbol, mark });

		const payment = paymentSince(previous.get(reading.perpSymbol), mark);
		if (payment === 0n) continue;

		entries.push({
			kind: "FUNDING_SETTLED",
			// Where the funding was paid, which is the perp venue — not Base,
			// where it is merely reported.
			chain: "SOLANA",
			symbol: reading.ticker,
			// Funding moves no units of the underlying. The position is unchanged
			// by being paid on; only the cash is different.
			baseAmount: 0n,
			notionalAssets: reading.notionalUsdc,
			pnlAssets: payment,
			// The venue takes nothing for settling funding. What it charges is on
			// the trades, and those are reported on their own rows.
			feeAssets: 0n,
			// Funding has no transaction. It is a balance change the venue applies
			// to every open position at once, with no identifier of its own to
			// quote — so the row carries none rather than inventing one that an
			// explorer would fail to resolve.
			txRef: "0x",
			occurredAt: fundingPeriodStart(now),
		});
	}

	return { entries, marks };
}

/**
 * What each market has paid since the agent last looked.
 *
 * `now` is stamped onto the rows through `fundingPeriodStart`, so a payment is
 * dated to the settlement that produced it rather than to the tick that noticed
 * it. Those differ by up to a tick, and the settlement is the honest answer —
 * it is when the venue moved the money.
 */
export async function fundingSettlements(
	vaultAddress: string,
	readings: FundingReading[],
	now: number,
): Promise<FundingSettlements> {
	// Nothing to read before anything is deployed, and a flat vault ticks on
	// indefinitely. Checked before the query rather than after it so an idle
	// vault does not ask Postgres once a minute for rows it cannot use — and so
	// the agent's one hard dependency on the database is confined to the state
	// where it actually has funding to account for.
	if (!readings.some((r) => r.accruedUsdc !== null && r.positionOpenedAt !== null)) {
		return { entries: [], commit: async () => {} };
	}

	const vault = vaultAddress.toLowerCase();
	const { entries, marks } = fundingPayments(readings, await loadWatermarks(vault), now);

	return {
		entries,
		commit: async () => {
			await Promise.all(marks.map(({ perpSymbol, mark }) => save(vault, perpSymbol, mark)));
		},
	};
}

/**
 * The payment between two readings.
 *
 * The first reading of a position is worth nothing on its own: the total it
 * carries accrued before the agent was watching — over a restart, or on a
 * position opened by an earlier deployment — and reporting it would credit this
 * period with however long that was. So a new position baselines at zero and the
 * next tick reports the first real payment.
 *
 * A changed `positionOpenedAt` means the previous position closed and this is a
 * different one, whose total starts from its own zero. Subtracting across that
 * boundary would report the old position's entire funding history as a single
 * negative payment — which is the failure this comparison exists to prevent, and
 * which a magnitude check could not catch, because a genuinely negative period
 * looks exactly the same.
 */
function paymentSince(previous: Watermark | undefined, current: Watermark): bigint {
	if (!previous) return 0n;
	if (previous.positionOpenedAt !== current.positionOpenedAt) return 0n;
	return current.accruedUsdc - previous.accruedUsdc;
}

async function loadWatermarks(vault: string): Promise<Map<string, Watermark>> {
	const rows = await prisma.fundingWatermark.findMany({ where: { vaultAddress: vault } });
	return new Map(
		rows.map((row) => [
			row.perpSymbol,
			{ accruedUsdc: BigInt(row.accruedUsdc), positionOpenedAt: row.positionOpenedAt },
		]),
	);
}

async function save(vault: string, perpSymbol: string, mark: Watermark): Promise<void> {
	const value = {
		accruedUsdc: mark.accruedUsdc.toString(),
		positionOpenedAt: mark.positionOpenedAt,
	};
	await prisma.fundingWatermark.upsert({
		where: { vaultAddress_perpSymbol: { vaultAddress: vault, perpSymbol } },
		create: { vaultAddress: vault, perpSymbol, ...value },
		update: value,
	});
}
