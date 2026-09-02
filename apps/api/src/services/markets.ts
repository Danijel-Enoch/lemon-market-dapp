import type { PairEconomics } from "@lemon/avantis";
import { findMarketBySymbol } from "@lemon/avantis";
import type { Market, MarketWithEconomics as SharedMarket } from "@lemon/core";
import { TtlCache } from "../cache";
import { clients } from "../config";
import { getTokenLogos } from "./logos";

/** A market joined with its live funding, fees and open interest. */
export interface MarketWithEconomics extends SharedMarket {
	economics: PairEconomics | null;
	/** Resolved from the token list by contract address; null falls back to a monogram. */
	logoUrl: string | null;
}

/**
 * Pair catalog changes rarely (listings, schedule flips), so a 60s TTL is
 * generous. Funding moves faster and is fetched on its own 5s cycle inside
 * AvantisDataClient.
 */
const marketsCache = new TtlCache<Market[]>(() => clients.avantis.getMarkets(), 60_000);

export async function getMarkets(force = false): Promise<MarketWithEconomics[]> {
	const [markets, economics, logos] = await Promise.all([
		marketsCache.get(force),
		clients.avantisData.getEconomics().catch(() => new Map<number, PairEconomics>()),
		getTokenLogos().catch(() => new Map<string, string>()),
	]);

	return markets.map((market) => {
		const econ = economics.get(market.pairIndex) ?? null;
		return {
			...market,
			economics: econ,
			fundingLongPercentPerHour: econ?.fundingRate.long ?? 0,
			fundingShortPercentPerHour: econ?.fundingRate.short ?? 0,
			longOpenInterest: econ?.openInterest.long ?? 0,
			shortOpenInterest: econ?.openInterest.short ?? 0,
			logoUrl: logos.get(market.base.toUpperCase()) ?? null,
			openFeePercent: econ?.openFeePercent ?? 0,
			closeFeePercent: econ?.closeFeePercent ?? 0,
			spreadPercent: econ?.spreadPercent ?? 0,
		};
	});
}

export async function getMarket(symbol: string): Promise<MarketWithEconomics | undefined> {
	const markets = await getMarkets();
	return findMarketBySymbol(markets, symbol) as MarketWithEconomics | undefined;
}

/**
 * Resolve a pair index from a symbol at call time.
 *
 * Every trading path goes through this rather than a stored index, because
 * Avantis indexes are not stable across protocol versions — v1 documented BTC
 * at index 0 while live v2 returns ETH there. A cached index would eventually
 * submit an order against the wrong company.
 */
export async function resolvePairIndex(symbol: string): Promise<number | undefined> {
	return (await getMarket(symbol))?.pairIndex;
}

/** Label positions without a second catalog fetch. */
export async function getSymbolResolver(): Promise<(pairIndex: number) => string | undefined> {
	const markets = await marketsCache.get();
	const byIndex = new Map(markets.map((market) => [market.pairIndex, market.symbol]));
	return (pairIndex: number) => byIndex.get(pairIndex);
}

export function invalidateMarkets(): void {
	marketsCache.invalidate();
}
