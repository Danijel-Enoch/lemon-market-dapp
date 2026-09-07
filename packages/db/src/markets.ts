import type { VaultConfig, VaultMarket } from "@prisma/client";
import { prisma } from "./client";

/**
 * A vault's markets, from wherever they are recorded.
 *
 * Shared between the agent and the API because both have to arrive at the same
 * answer, and the interesting part is the seeding: every vault created before a
 * vault could have more than one market has its founding market described by
 * `VaultConfig`'s own columns and nothing in `VaultMarket` at all. Making that
 * an operator's chore would mean a window where those vaults have no markets,
 * and a vault with no markets is one the agent skips — so a schema change would
 * quietly stop every existing agent until somebody ran a script.
 *
 * Instead the first read seeds the row. It is idempotent, it writes exactly what
 * the old columns already said, and afterwards there is one place markets live.
 */

export interface VaultMarketConfig {
	ticker: string;
	spotTokenAddress: string;
	spotTokenDecimals: number;
	spotTokenSymbol: string;
	perpSymbol: string;
	targetWeightBps: number;
	enabled: boolean;
	seeded: boolean;
}

export const FULL_WEIGHT_BPS = 10_000;

/**
 * Read a vault's markets, seeding the founding one if there are none.
 *
 * Ordered enabled-first and then by weight, so the caller's "primary" market is
 * the first element without anyone having to sort. Returns an empty array only
 * when the vault has no `VaultConfig` at all, which is the existing "no venue
 * configuration" state the agent already refuses to trade.
 */
export async function vaultMarkets(vaultAddress: string): Promise<VaultMarketConfig[]> {
	const address = vaultAddress.toLowerCase();

	const existing = await prisma.vaultMarket.findMany({ where: { vaultAddress: address } });
	if (existing.length > 0) return existing.map(toConfig).sort(byPrecedence);

	const config = await prisma.vaultConfig.findUnique({ where: { address } });
	if (!config) return [];

	return [toConfig(await seedFoundingMarket(config))];
}

/**
 * Write the founding market as a row, from the columns that already describe it.
 *
 * `upsert` rather than `create` because two agent ticks — or a tick and an API
 * request — can reach this at the same moment for the same vault, and losing a
 * race here should cost nothing.
 */
export async function seedFoundingMarket(config: VaultConfig): Promise<VaultMarket> {
	const seed = {
		spotTokenAddress: config.spotTokenAddress,
		spotTokenDecimals: config.spotTokenDecimals,
		spotTokenSymbol: config.spotTokenSymbol,
		perpSymbol: config.perpSymbol,
		targetWeightBps: FULL_WEIGHT_BPS,
		enabled: true,
		seeded: true,
	};

	return prisma.vaultMarket.upsert({
		where: {
			vaultAddress_ticker: { vaultAddress: config.address, ticker: config.ticker },
		},
		// Deliberately empty. If a row is already there, it is the operator's, and
		// this is a seeding path — it must never overwrite a weight somebody set.
		update: {},
		create: { vaultAddress: config.address, ticker: config.ticker, ...seed },
	});
}

function toConfig(row: VaultMarket): VaultMarketConfig {
	return {
		ticker: row.ticker,
		spotTokenAddress: row.spotTokenAddress,
		spotTokenDecimals: row.spotTokenDecimals,
		spotTokenSymbol: row.spotTokenSymbol,
		perpSymbol: row.perpSymbol,
		// A disabled market's target is zero however the row reads. Storing it
		// that way instead would lose the weight an operator would get back when
		// they re-enable it.
		targetWeightBps: row.enabled ? row.targetWeightBps : 0,
		enabled: row.enabled,
		seeded: row.seeded,
	};
}

function byPrecedence(a: VaultMarketConfig, b: VaultMarketConfig): number {
	if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
	if (a.targetWeightBps !== b.targetWeightBps) return b.targetWeightBps - a.targetWeightBps;
	return a.ticker.localeCompare(b.ticker);
}

/**
 * Check a proposed set of markets before it is written.
 *
 * Returns the reason it cannot be used, or null. Weights are required to sum to
 * exactly 10000 rather than being normalised on the operator's behalf: a set
 * that sums to 9000 is far more likely to be a typo than an intention to leave a
 * tenth of the vault idle, and normalising it silently would deploy capital at
 * proportions nobody chose.
 */
export function validateWeights(
	markets: Array<{ ticker: string; targetWeightBps: number }>,
): string | null {
	if (markets.length === 0) {
		return "A vault needs at least one market. To stop it trading, close its positions or stand the agent down.";
	}

	const seen = new Set<string>();
	for (const market of markets) {
		const ticker = market.ticker.toUpperCase();
		if (seen.has(ticker)) return `${ticker} is listed twice.`;
		seen.add(ticker);

		if (!Number.isInteger(market.targetWeightBps) || market.targetWeightBps <= 0) {
			return `${ticker} needs a positive weight. Remove it instead of weighting it at zero.`;
		}
	}

	const total = markets.reduce((sum, m) => sum + m.targetWeightBps, 0);
	if (total !== FULL_WEIGHT_BPS) {
		return `The weights add up to ${(total / 100).toFixed(2)}%, and they have to add up to 100%.`;
	}

	return null;
}
