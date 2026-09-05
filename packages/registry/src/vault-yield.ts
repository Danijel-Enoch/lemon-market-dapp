import type { Market } from "@lemon/core";
import { defaultCosts, planBasis, REFERENCE_NOTIONAL_USD } from "./basis";

/**
 * What a vault would pay a depositor, if today's funding rate held.
 *
 * This is the number someone needs *before* they deposit, and the board cannot
 * give it to them: the realised columns are the change in a vault's own share
 * price, so a vault that has existed for a day has no answer, and a vault that
 * has never been deposited into has no answer it will ever get. A depositor
 * looking at a dash is not being protected from a bad estimate — they are being
 * asked to commit capital with nothing to commit it against.
 *
 * So this is a projection, and it is labelled as one everywhere it is shown.
 * The distinction it must never blur is that a realised figure is a measurement
 * and this is an extrapolation from a rate that changes hourly.
 *
 * What separates it from the naive version — annualising the funding rate and
 * printing it — is that every deduction between the venue's rate and the
 * depositor's return is applied here:
 *
 *  1. **Leverage.** Funding accrues on notional, and a depositor funds both the
 *     spot leg and the perp margin. At 1x, half the capital is margin earning
 *     nothing, so the yield on capital is half the yield on notional.
 *  2. **The idle buffer.** A vault may only deploy `maxDeployedBps` of itself;
 *     the rest waits for the redemption queue and earns zero.
 *  3. **Round-trip venue costs.** Four fills and the spot pool's impact.
 *  4. **The management fee**, streaming against total assets.
 *  5. **The performance fee**, on whatever is left.
 *
 * Skipping any of them produces a number roughly twice the truth, which is
 * worse than the dash it replaced.
 */

/** Basis points to a percent. */
const BPS = 100;

export interface VaultYieldInput {
	/**
	 * Short-side funding, percent per hour, as the venue quotes it.
	 *
	 * Positive means the short side receives. The sign is preserved rather than
	 * normalised, because a negative rate is a real and important answer: the
	 * vault would be paying to hold its hedge.
	 */
	fundingShortPercentPerHour: number;
	/** The vault's mandated leverage on the perp leg — 1 for unlevered, 3 for 3x. */
	leverage: number;
	/**
	 * The fraction of the vault that may be at the venues at once, 0 to 1.
	 *
	 * From `maxDeployedBps`. The remainder is the redemption buffer and earns
	 * nothing, so it dilutes the yield of the part that is working.
	 */
	deployedFraction: number;
	/** Streaming management fee, bps per year. */
	managementFeeBps: number;
	/** Performance fee above the high-water mark, bps. */
	performanceFeeBps: number;
	/**
	 * Measured spot price impact on entry, as a percent. Signed or not — the
	 * magnitude is what is charged, on the way in and again on the way out.
	 */
	spotImpactPercent?: number;
	/** The perp market, for its own fee and lot metadata. */
	market: Market;
	/**
	 * Entries and exits assumed per year, for amortising the round trip.
	 *
	 * One by default, matching how the market board quotes `netApyPercent`, so a
	 * vault's projection and its market's row are computed on the same
	 * assumption and can be compared. A vault that churns its position more
	 * often pays the round trip more often, and this is the knob that says so.
	 */
	roundTripsPerYear?: number;
}

/**
 * The projection, and every step that produced it.
 *
 * Returned as a breakdown rather than a single number because the single number
 * is not defensible on its own. A depositor who sees "6.1%" next to a venue
 * advertising 14% funding is owed the four lines that explain the gap, and an
 * operator debugging a projection that looks wrong needs to see which step
 * moved it.
 */
export interface VaultYieldProjection {
	/** Annualised short funding on the position's notional, percent. */
	fundingAprPercent: number;
	/** The same funding, measured against the capital that had to be posted. */
	grossApyPercent: number;
	/** After the idle buffer, which earns nothing. */
	afterBufferApyPercent: number;
	/** After the venue round trip, amortised. */
	afterCostsApyPercent: number;
	/** After the streaming management fee. */
	afterManagementApyPercent: number;
	/** What a depositor keeps. The headline figure. */
	netApyPercent: number;

	/** The round trip charged in this projection, as a percent of capital per year. */
	roundTripDragPercent: number;
	/** The management fee, as a percent per year. */
	managementFeePercent: number;
	/** The performance fee actually deducted, as a percent per year. */
	performanceFeeDragPercent: number;

	/** Days of funding needed to cover one round trip. Null when funding is negative. */
	breakevenDays: number | null;
	/** True when the venue is currently paying the short side at all. */
	fundingPositive: boolean;

	/** The inputs this was computed at, so the figure can be reproduced. */
	assumptions: {
		leverage: number;
		deployedFraction: number;
		managementFeeBps: number;
		performanceFeeBps: number;
		roundTripsPerYear: number;
		spotImpactPercent: number;
	};
}

/**
 * Project a vault's yield from the current funding rate.
 *
 * Pure. Every input is a number the caller has already read from the venue or
 * the chain, which is what makes this testable and what keeps the arithmetic in
 * one place rather than duplicated between the board, the vault page and the
 * deposit panel.
 */
export function projectVaultApy(input: VaultYieldInput): VaultYieldProjection {
	const leverage = input.leverage > 0 ? input.leverage : 1;
	const deployedFraction = clamp(input.deployedFraction, 0, 1);
	const roundTripsPerYear = input.roundTripsPerYear ?? 1;
	const impact = Math.abs(input.spotImpactPercent ?? 0);

	// The single-position economics, at a reference size. Reused rather than
	// reimplemented: the board ranks markets with this same function, and a
	// second copy here would let the two drift into disagreeing about the same
	// market.
	const plan = planBasis({
		notionalUsd: REFERENCE_NOTIONAL_USD,
		perpLeverage: leverage,
		funding: { long: -input.fundingShortPercentPerHour, short: input.fundingShortPercentPerHour },
		costs: defaultCosts({
			spotBuyImpactPercent: impact,
			// Exit impact is unknowable in advance; the entry measurement is the
			// best estimate available and is labelled as such wherever it is shown.
			spotSellImpactPercent: impact,
		}),
		market: input.market,
	});

	const grossApyPercent = plan.fundingApyPercent;
	const afterBufferApyPercent = grossApyPercent * deployedFraction;

	// The round trip is charged against notional, so it scales with the deployed
	// fraction exactly as the funding does — a vault that only deploys 85% of
	// itself pays 85% of the costs as well as earning 85% of the yield.
	const roundTripDragPercent =
		(plan.roundTripCostPercent / (1 + 1 / leverage)) * roundTripsPerYear * deployedFraction;
	const afterCostsApyPercent = afterBufferApyPercent - roundTripDragPercent;

	// Management is charged on total assets, including the idle buffer. It is
	// not scaled by the deployed fraction: a depositor pays it on everything
	// they put in, whether or not the vault has put it to work.
	const managementFeePercent = input.managementFeeBps / BPS;
	const afterManagementApyPercent = afterCostsApyPercent - managementFeePercent;

	// Performance is charged on the gain, so it takes nothing from a loss. A
	// vault that is under water pays no performance fee and this must not invent
	// one — nor may it net a negative fee back into the return.
	const performanceFeeDragPercent =
		afterManagementApyPercent > 0
			? (afterManagementApyPercent * input.performanceFeeBps) / (BPS * BPS)
			: 0;
	const netApyPercent = afterManagementApyPercent - performanceFeeDragPercent;

	return {
		fundingAprPercent: plan.fundingAprPercent,
		grossApyPercent,
		afterBufferApyPercent,
		afterCostsApyPercent,
		afterManagementApyPercent,
		netApyPercent,
		roundTripDragPercent,
		managementFeePercent,
		performanceFeeDragPercent,
		breakevenDays: plan.breakevenHours === null ? null : plan.breakevenHours / 24,
		fundingPositive: plan.hasPositiveFunding,
		assumptions: {
			leverage,
			deployedFraction,
			managementFeeBps: input.managementFeeBps,
			performanceFeeBps: input.performanceFeeBps,
			roundTripsPerYear,
			spotImpactPercent: impact,
		},
	};
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}
