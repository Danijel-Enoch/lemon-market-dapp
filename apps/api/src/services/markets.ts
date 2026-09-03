import type { MarketWithEconomics as SharedMarket } from "@lemon/core";
import { findMarket, fundingToApr, joinMarkets, type PacificaMarket } from "@lemon/pacifica";
import { TtlCache } from "../cache";
import { clients } from "../config";
import { getTokenLogos } from "./logos";

/**
 * The tradable universe, sourced from Pacifica.
 *
 * Pacifica splits a market across two endpoints — `/info` for the static
 * definition and `/info/prices` for live state — so both are fetched and
 * joined. They are cached together on one short TTL rather than separately:
 * a market list newer than its price rows (or the reverse) produces markets
 * with no price, or prices with no market, both of which surface as gaps.
 *
 * Every listed market is returned. Filtering by asset class is the caller's
 * business, so a new Pacifica listing appears without a change here.
 */
export interface MarketWithEconomics extends SharedMarket {
	/** The raw Pacifica join, for callers that need tick/lot sizes. */
	pacifica: PacificaMarket;
	logoUrl: string | null;
}

const universeCache = new TtlCache<PacificaMarket[]>(async () => {
	const [info, prices] = await Promise.all([
		clients.pacifica.markets(),
		clients.pacifica.prices().catch(() => []),
	]);
	return joinMarkets(info, prices);
}, 10_000);

/**
 * Adapt a Pacifica market to the shape the rest of the app already speaks.
 *
 * Two conventions differ from Avantis and are normalised here:
 *
 *   * Funding is quoted per hour as a fraction; the app works in percent per
 *     hour, and by side. A positive Pacifica rate means longs pay, so the long
 *     figure is negated and the short figure is not.
 *   * Pacifica reports one open-interest number and no long/short breakdown.
 *     The per-side fields are therefore left at zero rather than split evenly:
 *     a 50/50 bar on every market would read as real, perfectly balanced
 *     positioning when in fact the split is simply unknown. The UI renders a
 *     dash for a zero total.
 */
function toShared(market: PacificaMarket, logoUrl: string | null): MarketWithEconomics {
	const perHourPercent = market.fundingRate * 100;

	return {
		pairIndex: 0,
		symbol: market.symbol,
		base: market.base,
		quote: market.quote,
		assetClass: market.assetClass,
		pythSymbol: null,
		isUpside: false,
		minLeverage: 1,
		maxLeverage: market.maxLeverage,
		minPositionUsdc: market.minOrderSize,
		openInterest: market.openInterest,
		maxOpenInterest: market.maxOrderSize,
		availableOpenInterest: Math.max(0, market.maxOrderSize - market.openInterest),
		isListed: true,
		closeOnly: false,
		// Pacifica perps run continuously; there are no session hours to honour.
		isOpen: true,
		nextOpen: null,
		nextClose: null,

		logoUrl,
		fundingLongPercentPerHour: -perHourPercent,
		fundingShortPercentPerHour: perHourPercent,
		longOpenInterest: 0,
		shortOpenInterest: 0,
		// Pacifica does not publish per-market fees; they come from the account's
		// fee level, so they are reported as zero rather than guessed at.
		openFeePercent: 0,
		closeFeePercent: 0,
		spreadPercent: 0,

		pacifica: market,
	};
}

export async function getMarkets(force = false): Promise<MarketWithEconomics[]> {
	const [universe, logos] = await Promise.all([
		universeCache.get(force),
		getTokenLogos().catch(() => new Map<string, string>()),
	]);

	return universe.map((market) => toShared(market, logos.get(market.base.toUpperCase()) ?? null));
}

export async function getMarket(symbol: string): Promise<MarketWithEconomics | undefined> {
	const markets = await getMarkets();
	const wanted = findMarket(
		markets.map((market) => market.pacifica),
		symbol,
	);
	if (!wanted) return undefined;
	return markets.find((market) => market.pacifica.pacificaSymbol === wanted.pacificaSymbol);
}

/** Live mark price for every market, keyed by display symbol. */
export async function getPrices(): Promise<Record<string, { price: number; at: number }>> {
	const universe = await universeCache.get();
	const out: Record<string, { price: number; at: number }> = {};
	const at = Date.now();
	for (const market of universe) {
		if (market.markPrice !== null) out[market.symbol] = { price: market.markPrice, at };
	}
	return out;
}

/**
 * Resolve a display symbol to the identifier Pacifica accepts on the wire.
 *
 * Trading paths call this rather than storing a symbol, so a route param in any
 * spelling ("BTC", "BTC-USD", "btc/usd") reaches the right market.
 */
export async function resolvePacificaSymbol(symbol: string): Promise<string | undefined> {
	return (await getMarket(symbol))?.pacifica.pacificaSymbol;
}

export { fundingToApr };
