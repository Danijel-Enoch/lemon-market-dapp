/**
 * Points rules.
 *
 * Kept as pure functions with the weights as named constants so the formula can
 * be tuned in one place and asserted in tests, rather than being scattered
 * through query code where a change silently re-ranks everyone.
 */

export type PointsSource = "spot_volume" | "basis_opened";

/** USD of volume that earns one point. */
export const USD_PER_VOLUME_POINT = 10;

/** Flat award for opening a basis position, on top of its spot volume. */
export const ACTION_POINTS = {
	// A basis position is two legs across two venues and is the only thing the
	// platform sells, so it is worth more than the same notional swapped
	// outright.
	basis_opened: 250,
} as const;

export interface PointsBreakdown {
	/** Notional bought on the spot leg, which is also the position's notional. */
	spotVolumeUsd: number;
	positionsOpened: number;
	volumePoints: number;
	positionPoints: number;
	total: number;
}

export function volumePoints(volumeUsd: number): number {
	if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return 0;
	return Math.floor(volumeUsd / USD_PER_VOLUME_POINT);
}

export function computePoints(input: {
	spotVolumeUsd: number;
	positionsOpened: number;
}): PointsBreakdown {
	const volume = volumePoints(input.spotVolumeUsd);
	const positionPoints = Math.max(0, input.positionsOpened) * ACTION_POINTS.basis_opened;

	return {
		spotVolumeUsd: input.spotVolumeUsd,
		positionsOpened: input.positionsOpened,
		volumePoints: volume,
		positionPoints,
		total: volume + positionPoints,
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
