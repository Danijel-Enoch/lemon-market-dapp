import type { BasisEconomics, Market } from "@lemon/core";
import { VENUE_FEES } from "@lemon/core";

const HOURS_PER_YEAR = 24 * 365;

/**
 * Per-side funding rates from the venue, expressed as **percent per hour**.
 *
 * Sign convention, quoting the protocol docs directly: *"A positive rate means
 * you receive, negative means you pay."* This is the opposite of the reading
 * most perp venues train you into, and getting it backwards would advertise a
 * basis position as yield-generating when it is in fact bleeding funding — so
 * the sign is preserved verbatim through every calculation here and rendered
 * with its sign in the UI.
 */
export interface FundingRates {
	long: number;
	short: number;
}

export interface BasisCosts {
	/** Spot taker fee, percent of notional, charged on entry and again on exit. */
	spotFeePercent: number;
	/** Perp taker fee, percent of notional, charged on entry and again on exit. */
	perpFeePercent: number;
	/** Perp spread, percent. */
	spreadPercent: number;
	/** Spot price impact on entry, percent (negative = value lost). */
	spotBuyImpactPercent: number;
	/** Estimated spot price impact on exit, percent. */
	spotSellImpactPercent: number;
	/** Estimated gas for both spot legs, in USD. */
	gasUsd: number;
}

/**
 * Fees for a full round trip, as a percent of notional.
 *
 * Four fills, not two: both legs are crossed on the way in and again on the way
 * out. Halving this — the natural mistake, since a "position" feels like one
 * entry and one exit — understates the cost by 0.2% of notional, which at
 * single-digit funding is most of a month's yield.
 */
export function roundTripFeePercent(costs: BasisCosts): number {
	return 2 * (costs.spotFeePercent + costs.perpFeePercent) + costs.spreadPercent;
}

/** The fee schedule every quote starts from, before venue-specific overrides. */
export function defaultCosts(overrides: Partial<BasisCosts> = {}): BasisCosts {
	return {
		spotFeePercent: VENUE_FEES.spotTakerPercent,
		perpFeePercent: VENUE_FEES.perpTakerPercent,
		spreadPercent: 0,
		spotBuyImpactPercent: 0,
		spotSellImpactPercent: 0,
		gasUsd: 0,
		...overrides,
	};
}

export interface BasisPlan {
	/** Total notional of each leg — equal, which is what makes it delta-neutral. */
	notionalUsd: number;
	/** USDC spent buying the spot token. */
	spotCostUsd: number;
	/** USDC posted as perp margin. */
	perpCollateralUsd: number;
	perpLeverage: number;
	/** Total capital the user must fund. */
	totalCapitalUsd: number;
	/** Net funding while held, percent per hour. Negative means it costs money. */
	netFundingPerHourPercent: number;
	/** Annualised funding as a percent of notional. */
	fundingAprPercent: number;
	/** Annualised funding on deployed capital, percent. */
	fundingApyPercent: number;
	/** One-off entry + exit costs, in USD. */
	roundTripCostUsd: number;
	/** The same costs as a percent of notional, for comparing across sizes. */
	roundTripCostPercent: number;
	/** Hours the position must be held for funding to cover round-trip costs. */
	breakevenHours: number | null;
	/** Net APR after amortising round-trip costs over a year. */
	netApyPercent: number;
	/**
	 * True when the *funding leg alone* pays the holder. Deliberately separate
	 * from `isNetPositive`: funding can be positive while entry and exit costs
	 * still swallow it, and conflating the two would advertise a losing
	 * position as profitable.
	 */
	hasPositiveFunding: boolean;
	/** True when the position is expected to profit after all costs. */
	isNetPositive: boolean;
	warnings: string[];
}

export interface BasisPlanInput {
	notionalUsd: number;
	perpLeverage: number;
	funding: FundingRates;
	costs: BasisCosts;
	market: Market;
}

/**
 * Size a delta-neutral spot-vs-perp position and price its economics.
 *
 * Structure: buy `notionalUsd` of the spot token, short the same notional on
 * the perp. Equal notionals mean price moves cancel, so the position's return
 * is funding minus costs — nothing else.
 */
export function planBasis(input: BasisPlanInput): BasisPlan {
	const { notionalUsd, perpLeverage, funding, costs, market } = input;

	const spotCostUsd = notionalUsd;
	const perpCollateralUsd = perpLeverage > 0 ? notionalUsd / perpLeverage : notionalUsd;
	const totalCapitalUsd = spotCostUsd + perpCollateralUsd;

	// The position holds a SHORT perp, so the short-side rate is what accrues.
	const netFundingPerHourPercent = funding.short;

	// Funding accrues on notional; the yield is measured against capital deployed.
	const fundingAprPercent = netFundingPerHourPercent * HOURS_PER_YEAR;
	const annualFundingUsd = (fundingAprPercent / 100) * notionalUsd;
	const fundingApyPercent = totalCapitalUsd > 0 ? (annualFundingUsd / totalCapitalUsd) * 100 : 0;

	const feePercent = roundTripFeePercent(costs);
	const slippagePercent =
		Math.abs(costs.spotBuyImpactPercent) + Math.abs(costs.spotSellImpactPercent);
	const roundTripCostUsd = ((feePercent + slippagePercent) / 100) * notionalUsd + costs.gasUsd;
	const roundTripCostPercent =
		notionalUsd > 0 ? (roundTripCostUsd / notionalUsd) * 100 : feePercent + slippagePercent;

	const fundingPerHourUsd = (netFundingPerHourPercent / 100) * notionalUsd;
	const breakevenHours = fundingPerHourUsd > 0 ? roundTripCostUsd / fundingPerHourUsd : null;

	const netApyPercent =
		totalCapitalUsd > 0 ? ((annualFundingUsd - roundTripCostUsd) / totalCapitalUsd) * 100 : 0;

	const warnings: string[] = [];

	if (netFundingPerHourPercent <= 0) {
		warnings.push(
			"Funding is negative on the short side right now — this position pays funding rather than earning it. A basis position only yields when the long side is crowded.",
		);
	} else if (netApyPercent <= 0) {
		warnings.push(
			"Funding is positive, but entry and exit costs exceed it over a year. This position only profits if held long enough to clear those costs.",
		);
	}
	if (breakevenHours !== null && breakevenHours > 24 * 30) {
		warnings.push(
			`Entry and exit costs take about ${Math.round(breakevenHours / 24)} days of funding to recover.`,
		);
	}
	if (!market.isOpen) {
		warnings.push(
			`${market.symbol} is closed. The spot token trades 24/7 but the perp does not, so the hedge cannot be adjusted until it reopens.`,
		);
	}
	// Both legs of an equity basis trade continuously — the token on Base and
	// the perp on Pacifica — but the market that prices the underlying does
	// not. Overnight and at weekends the two legs are marked against each other
	// with no cash market anchoring either, so the spread can widen on thin
	// flow and snap back at the open. That is a real risk and worth stating,
	// but it is not the "one leg is frozen" risk a venue with session hours
	// would carry, and describing it as such would be wrong.
	if (market.assetClass === "equity") {
		warnings.push(
			"The underlying stock market closes nights and weekends, though both legs here keep trading. With no cash market to anchor them, the spread can widen on thin flow and reprice at the open.",
		);
	}
	if (notionalUsd < market.minPositionUsdc) {
		warnings.push(`${market.symbol} requires a minimum position of $${market.minPositionUsdc}.`);
	}
	if (perpLeverage > market.maxLeverage) {
		warnings.push(`${market.symbol} caps leverage at ${market.maxLeverage}x.`);
	}

	return {
		notionalUsd,
		spotCostUsd,
		perpCollateralUsd,
		perpLeverage,
		totalCapitalUsd,
		netFundingPerHourPercent,
		fundingAprPercent,
		fundingApyPercent,
		roundTripCostUsd,
		roundTripCostPercent,
		breakevenHours,
		netApyPercent,
		hasPositiveFunding: netFundingPerHourPercent > 0,
		isNetPositive: netApyPercent > 0,
		warnings,
	};
}

/**
 * The size every row on the board is quoted at — and, deliberately, the exact
 * size the liquidity probe trades to measure slippage.
 *
 * These two must be the same number. Fees are proportional to size but slippage
 * is not, so pricing a row at one notional using impact measured at another
 * silently understates the cost of every thin market: a $100 probe reports
 * around 0.6% on a tokenized-equity pool where a real $1,000 fill pays nearly
 * 2%. The board would then advertise a yield that the trade ticket immediately
 * contradicts, which is worse than either number alone.
 *
 * Exported from here rather than from the probe so the dependency runs the
 * right way: the quote size is a product decision, and the probe follows it.
 */
export const REFERENCE_NOTIONAL_USD = 1_000;
export const REFERENCE_LEVERAGE = 2;

export interface BasisEconomicsInput {
	funding: FundingRates;
	market: Market;
	/** Executable spot price from a live route. Null when the token has no pool. */
	spotPriceUsd: number | null;
	/** Perp mark. Null when the venue is not quoting. */
	perpMarkPrice: number | null;
	/** Measured price impact of a probe buy, as a negative percent. */
	spotBuyImpactPercent: number | null;
	notionalUsd?: number;
	leverage?: number;
}

/**
 * Price one market for the board.
 *
 * Thin wrapper over `planBasis` so a row and the quote the user eventually
 * commits to are produced by the same arithmetic. Anything that ranks markets
 * by a separately-derived yield will eventually rank them by a number the
 * trade ticket then contradicts.
 */
export function computeBasisEconomics(input: BasisEconomicsInput): BasisEconomics {
	const notionalUsd = input.notionalUsd ?? REFERENCE_NOTIONAL_USD;
	const leverage = input.leverage ?? REFERENCE_LEVERAGE;
	const impact = input.spotBuyImpactPercent ?? 0;

	const plan = planBasis({
		notionalUsd,
		perpLeverage: leverage,
		funding: input.funding,
		costs: defaultCosts({
			spotBuyImpactPercent: impact,
			// Exit impact is unknowable ahead of time; the entry measurement is
			// the best available estimate and is labelled as such in the UI.
			spotSellImpactPercent: impact,
		}),
		market: input.market,
	});

	return {
		basisPercent: spotPerpBasisPercent(input.spotPriceUsd, input.perpMarkPrice),
		fundingShortPercentPerHour: plan.netFundingPerHourPercent,
		fundingAprPercent: plan.fundingAprPercent,
		fundingApyPercent: plan.fundingApyPercent,
		roundTripCostPercent: plan.roundTripCostPercent,
		netApyPercent: plan.netApyPercent,
		breakevenDays: plan.breakevenHours === null ? null : plan.breakevenHours / 24,
		referenceNotionalUsd: notionalUsd,
		referenceLeverage: leverage,
	};
}

/**
 * The instantaneous spread between the two legs, as a percent of spot.
 *
 * Positive means the perp is rich, which is the direction that pays a
 * long-spot/short-perp holder as the two converge. Null rather than zero when
 * either side has no price: an unquoted market is unknown, and a flat zero
 * would read as a market that is fairly priced and safe to enter.
 */
export function spotPerpBasisPercent(
	spotPriceUsd: number | null,
	perpMarkPrice: number | null,
): number | null {
	if (!spotPriceUsd || !perpMarkPrice || spotPriceUsd <= 0) return null;
	return ((perpMarkPrice - spotPriceUsd) / spotPriceUsd) * 100;
}

/** Annualise a percent-per-hour funding rate. */
export function annualizeFunding(percentPerHour: number): number {
	return percentPerHour * HOURS_PER_YEAR;
}

/**
 * How far the two legs have drifted from neutral, as a percent of spot notional.
 * Non-zero drift means the position is no longer delta-neutral and is taking
 * directional risk — worth surfacing on the position card.
 */
export function deltaDriftPercent(spotNotionalUsd: number, perpNotionalUsd: number): number {
	if (spotNotionalUsd === 0) return 0;
	return ((spotNotionalUsd - perpNotionalUsd) / spotNotionalUsd) * 100;
}

/* ------------------------------------------------------------- rebalancing */

/**
 * Drift below which rebalancing costs more than it fixes.
 *
 * A rebalance is a taker fill, so it costs 0.1% of the traded notional plus
 * slippage. Chasing a 0.2% delta with a trade that costs 0.1% of it is not
 * risk management, it is churn — and on the lot-grid rounding that causes most
 * small drift, the correction may not even be expressible.
 */
export const REBALANCE_DRIFT_THRESHOLD_PERCENT = 1;

export interface HedgeHealthInput {
	/** Units of the token actually held on the spot leg. */
	spotUnits: number;
	/** Units of the perp actually short. Zero when the hedge is gone. */
	perpUnits: number;
	/** Live mark, used to express the gap in money as well as in units. */
	markPrice: number;
	/** Venue quantity increment; a correction smaller than this cannot be placed. */
	lotSize: number;
}

export interface HedgeHealth {
	spotUnits: number;
	perpUnits: number;
	/**
	 * Signed unit gap: positive means under-hedged (long exposure), negative
	 * means over-hedged (short exposure).
	 *
	 * Both directions matter and they are not symmetric in how they arise —
	 * under-hedging is the common case, from the lot-grid rounding at open —
	 * but a position can end up over-hedged after a partial spot sell, and
	 * reporting only the magnitude would hide which way the user is exposed.
	 */
	deltaUnits: number;
	/** The gap as a percent of the spot leg. */
	driftPercent: number;
	/** The gap in USD at the current mark. */
	deltaUsd: number;
	/** Direction, for wording that does not make the reader do the sign maths. */
	exposure: "neutral" | "long" | "short";
	/** True when drift is worth correcting *and* large enough to be placeable. */
	shouldRebalance: boolean;
	/**
	 * Units the perp leg must trade to close the gap, already rounded onto the
	 * lot grid. Positive means sell more perp, negative means buy some back.
	 */
	correctionUnits: number;
}

/**
 * Compare the two legs and say whether the hedge still holds.
 *
 * Measured in **units of the underlying, not in dollars**. A basis position is
 * neutral when it is long and short the same number of units, and that stays
 * true at any price — so a dollar-denominated check would report drift every
 * time the market moved, and a user following it would rebalance repeatedly
 * against a position that was never unbalanced.
 */
export function hedgeHealth(input: HedgeHealthInput): HedgeHealth {
	const { spotUnits, perpUnits, markPrice, lotSize } = input;

	const deltaUnits = spotUnits - perpUnits;
	const driftPercent = spotUnits === 0 ? 0 : (deltaUnits / spotUnits) * 100;
	const deltaUsd = deltaUnits * markPrice;

	// Round *down* in magnitude onto the lot grid. Rounding up would overshoot
	// past neutral and leave the position exposed the other way.
	const correctionUnits =
		lotSize > 0
			? Math.sign(deltaUnits) * Math.floor(Math.abs(deltaUnits) / lotSize) * lotSize
			: deltaUnits;

	const exposure: HedgeHealth["exposure"] =
		Math.abs(driftPercent) < REBALANCE_DRIFT_THRESHOLD_PERCENT
			? "neutral"
			: deltaUnits > 0
				? "long"
				: "short";

	return {
		spotUnits,
		perpUnits,
		deltaUnits,
		driftPercent,
		deltaUsd,
		exposure,
		// Both conditions, not either: drift worth fixing that rounds to zero on
		// the lot grid cannot be fixed, and offering the button anyway produces a
		// rebalance that trades nothing and reports success.
		shouldRebalance:
			Math.abs(driftPercent) >= REBALANCE_DRIFT_THRESHOLD_PERCENT && Math.abs(correctionUnits) > 0,
		correctionUnits,
	};
}
