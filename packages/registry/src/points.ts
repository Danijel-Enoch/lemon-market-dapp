/**
 * Points rules.
 *
 * Kept as pure functions with the weights as named constants so the formula can
 * be tuned in one place and asserted in tests, rather than being scattered
 * through query code where a change silently re-ranks everyone.
 */

export type PointsSource = "perp_volume" | "spot_volume" | "carry_opened" | "basket_entry";

/** USD of volume that earns one point. */
export const USD_PER_VOLUME_POINT = 10;

/** Flat awards for actions worth more than their notional suggests. */
export const ACTION_POINTS: Record<"carry_opened" | "basket_entry", number> = {
	// A carry is two legs across two venues and is the app's flagship flow, so
	// it is worth more than the same notional traded outright.
	carry_opened: 250,
	basket_entry: 100,
};

export interface PointsBreakdown {
	perpVolumeUsd: number;
	spotVolumeUsd: number;
	carriesOpened: number;
	basketEntries: number;
	perpPoints: number;
	spotPoints: number;
	carryPoints: number;
	basketPoints: number;
	total: number;
}

export function volumePoints(volumeUsd: number): number {
	if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return 0;
	return Math.floor(volumeUsd / USD_PER_VOLUME_POINT);
}

export function computePoints(input: {
	perpVolumeUsd: number;
	spotVolumeUsd: number;
	carriesOpened: number;
	basketEntries: number;
}): PointsBreakdown {
	const perpPoints = volumePoints(input.perpVolumeUsd);
	const spotPoints = volumePoints(input.spotVolumeUsd);
	const carryPoints = Math.max(0, input.carriesOpened) * ACTION_POINTS.carry_opened;
	const basketPoints = Math.max(0, input.basketEntries) * ACTION_POINTS.basket_entry;

	return {
		perpVolumeUsd: input.perpVolumeUsd,
		spotVolumeUsd: input.spotVolumeUsd,
		carriesOpened: input.carriesOpened,
		basketEntries: input.basketEntries,
		perpPoints,
		spotPoints,
		carryPoints,
		basketPoints,
		total: perpPoints + spotPoints + carryPoints + basketPoints,
	};
}

export interface Tier {
	name: string;
	minPoints: number;
}

/** Display tiers. Purely cosmetic — they confer nothing. */
export const TIERS: readonly Tier[] = [
	{ name: "Seed", minPoints: 0 },
	{ name: "Sprout", minPoints: 500 },
	{ name: "Grove", minPoints: 5_000 },
	{ name: "Orchard", minPoints: 25_000 },
	{ name: "Harvest", minPoints: 100_000 },
] as const;

export function tierFor(points: number): Tier {
	let current = TIERS[0];
	for (const tier of TIERS) {
		if (points >= tier.minPoints) current = tier;
	}
	return current;
}

/** Points still needed for the next tier, or null at the top. */
export function pointsToNextTier(points: number): { next: Tier; remaining: number } | null {
	const next = TIERS.find((tier) => points < tier.minPoints);
	return next ? { next, remaining: next.minPoints - points } : null;
}
