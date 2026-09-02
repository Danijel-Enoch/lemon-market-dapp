import type { Market } from "@lemon/core";

const HOURS_PER_YEAR = 24 * 365;

/**
 * Per-side funding rates from the Avantis data service (`GET /v2/trading`),
 * expressed as **percent per hour**.
 *
 * Sign convention, quoting the protocol docs directly: *"A positive rate means
 * you receive, negative means you pay."* This is the opposite of the reading
 * most perp venues train you into, and getting it backwards would advertise a
 * cash-and-carry as yield-generating when it is in fact bleeding funding — so
 * the sign is preserved verbatim through every calculation here and rendered
 * with its sign in the UI.
 */
export interface FundingRates {
	long: number;
	short: number;
}

export interface CarryCosts {
	/** Perp open fee, percent of notional. */
	openFeePercent: number;
	/** Perp close fee, percent of notional. */
	closeFeePercent: number;
	/** Perp spread, percent. */
	spreadPercent: number;
	/** Spot price impact on entry, percent (negative = value lost). */
	spotBuyImpactPercent: number;
	/** Estimated spot price impact on exit, percent. */
	spotSellImpactPercent: number;
	/** Estimated gas for both spot legs, in USD. */
	gasUsd: number;
}

export interface CarryPlan {
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
	/** Annualised funding on deployed capital, percent. */
	fundingApyPercent: number;
	/** One-off entry + exit costs, in USD. */
	roundTripCostUsd: number;
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

export interface CarryPlanInput {
	notionalUsd: number;
	perpLeverage: number;
	funding: FundingRates;
	costs: CarryCosts;
	market: Market;
}

/**
 * Size a delta-neutral cash-and-carry and price its economics.
 *
 * Structure: buy `notionalUsd` of the spot token, short the same notional on
 * the perp. Equal notionals mean price moves cancel, so the position's return
 * is funding minus costs — nothing else.
 */
export function planCarry(input: CarryPlanInput): CarryPlan {
	const { notionalUsd, perpLeverage, funding, costs, market } = input;

	const spotCostUsd = notionalUsd;
	const perpCollateralUsd = perpLeverage > 0 ? notionalUsd / perpLeverage : notionalUsd;
	const totalCapitalUsd = spotCostUsd + perpCollateralUsd;

	// The carry holds a SHORT perp, so the short-side rate is what accrues.
	const netFundingPerHourPercent = funding.short;

	// Funding accrues on notional; the yield is measured against capital deployed.
	const annualFundingUsd = (netFundingPerHourPercent / 100) * notionalUsd * HOURS_PER_YEAR;
	const fundingApyPercent = totalCapitalUsd > 0 ? (annualFundingUsd / totalCapitalUsd) * 100 : 0;

	const perpFeesUsd =
		((costs.openFeePercent + costs.closeFeePercent + costs.spreadPercent) / 100) * notionalUsd;
	const spotSlippageUsd =
		((Math.abs(costs.spotBuyImpactPercent) + Math.abs(costs.spotSellImpactPercent)) / 100) *
		notionalUsd;
	const roundTripCostUsd = perpFeesUsd + spotSlippageUsd + costs.gasUsd;

	const fundingPerHourUsd = (netFundingPerHourPercent / 100) * notionalUsd;
	const breakevenHours = fundingPerHourUsd > 0 ? roundTripCostUsd / fundingPerHourUsd : null;

	const netApyPercent =
		totalCapitalUsd > 0 ? ((annualFundingUsd - roundTripCostUsd) / totalCapitalUsd) * 100 : 0;

	const warnings: string[] = [];

	if (netFundingPerHourPercent <= 0) {
		warnings.push(
			"Funding is negative on the short side right now — this position pays funding rather than earning it. A cash-and-carry only yields when the long side is crowded.",
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
	// Equities are 24/5: the spot leg stays live over the weekend while the
	// perp is shut, so the position is only half-unwindable during that window.
	if (market.assetClass === "equity") {
		warnings.push(
			"Equity perps close nights and weekends. While the market is shut you can still sell the spot leg but cannot close the short, which breaks the hedge.",
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
		fundingApyPercent,
		roundTripCostUsd,
		breakevenHours,
		netApyPercent,
		hasPositiveFunding: netFundingPerHourPercent > 0,
		isNetPositive: netApyPercent > 0,
		warnings,
	};
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
