import type { AssetClass } from "@lemon/core";
import type { PacificaMarketInfo, PacificaPrice } from "./types";

/**
 * Classifying the Pacifica universe.
 *
 * Pacifica's `/info` describes *how* a market trades — tick size, lot size,
 * leverage — but not what the underlying is: everything is `instrument_type:
 * "perpetual"` whether it tracks Bitcoin, Nvidia or natural gas. The app groups
 * markets by asset class, so the class has to come from the symbol.
 *
 * That means an explicit list, and an explicit list goes stale when Pacifica
 * lists something new. The default is therefore `crypto` — the overwhelmingly
 * common case — and `classifyPacificaSymbol` is deliberately the only place
 * that knows about this, so a new listing is a one-line change here rather than
 * a hunt through the UI.
 */

/** Equity perps: single-name stocks. */
const EQUITIES = new Set([
	"NVDA",
	"TSLA",
	"GOOGL",
	"MSTR",
	"PLTR",
	"HOOD",
	"CRCL",
	"MU",
	"SNDK",
	"SAMSUNG",
	"SKHYNIX",
	"SPCX",
	"BP",
	"LIT",
	"MEGA",
]);

/** Precious and industrial metals. PAXG is tokenised gold, so it groups here. */
const METALS = new Set(["XAU", "XAG", "PAXG", "PLATINUM", "COPPER"]);

/** Energy and other physical commodities. */
const COMMODITIES = new Set(["CL", "NATGAS", "URNM", "DRAM", "CHIP"]);

/** Broad-market indices. */
const INDICES = new Set(["SP500"]);

/** FX majors. These are the only symbols shaped like a currency pair. */
const FX = new Set(["EURUSD", "USDJPY"]);

export function classifyPacificaSymbol(symbol: string): AssetClass {
	const upper = symbol.toUpperCase();
	if (FX.has(upper)) return "fx";
	if (EQUITIES.has(upper)) return "equity";
	if (METALS.has(upper)) return "metal";
	if (COMMODITIES.has(upper)) return "commodity";
	if (INDICES.has(upper)) return "index";
	return "crypto";
}

/**
 * Display symbol for a market.
 *
 * Pacifica names a perp by its underlying alone ("BTC"). The app has always
 * shown a pair, so the USD quote is appended — except where the symbol is
 * already a pair (EURUSD) or already carries a quote (SOL-USDC).
 */
export function toDisplaySymbol(symbol: string): string {
	const upper = symbol.toUpperCase();
	if (upper.includes("-")) return upper.replace("-", "/");
	if (FX.has(upper)) return `${upper.slice(0, 3)}/${upper.slice(3)}`;
	return `${upper}/USD`;
}

/** Inverse of `toDisplaySymbol`, for turning a route param back into an API symbol. */
export function toPacificaSymbol(display: string): string {
	const upper = display.trim().toUpperCase().replace(/[_/]/g, "-");
	// FX is checked before the USD suffix is stripped: "EUR/USD" is a currency
	// pair whose wire symbol is EURUSD, not a USD-quoted perp on "EUR".
	const joined = upper.replace(/-/g, "");
	if (FX.has(joined)) return joined;
	if (upper.endsWith("-USD")) return upper.slice(0, -4);
	return upper;
}

/**
 * A Pacifica market joined with its live price row.
 *
 * Pacifica splits static market definition (`/info`) from live state
 * (`/info/prices`); this is the join the rest of the app consumes.
 */
export interface PacificaMarket {
	symbol: string;
	/** Pacifica's own identifier, e.g. "BTC". Use this on the wire. */
	pacificaSymbol: string;
	base: string;
	quote: string;
	assetClass: AssetClass;
	instrumentType: string;
	maxLeverage: number;
	isolatedOnly: boolean;
	/** Price increment. Orders off this grid are rejected. */
	tickSize: number;
	/** Quantity increment. */
	lotSize: number;
	/** Minimum order value in USD. */
	minOrderSize: number;
	maxOrderSize: number;

	/* live state — null until the price feed answers */
	markPrice: number | null;
	midPrice: number | null;
	oraclePrice: number | null;
	/** Per-hour funding as a fraction. Positive means longs pay shorts. */
	fundingRate: number;
	nextFundingRate: number;
	openInterest: number;
	volume24h: number;
	/** Percent move over 24h, from `yesterday_price`. */
	change24hPercent: number | null;
}

/**
 * Funding is quoted per hour; the UI talks in APR.
 *
 * Sign convention matches the app's existing one: a *long* receives when the
 * rate is negative, so the long-side figure is the negation of the raw rate.
 */
export function fundingToApr(perHour: number): number {
	return perHour * 24 * 365 * 100;
}

export function joinMarkets(info: PacificaMarketInfo[], prices: PacificaPrice[]): PacificaMarket[] {
	const priceBySymbol = new Map(prices.map((price) => [price.symbol, price]));

	return info.map((market) => {
		const price = priceBySymbol.get(market.symbol);
		const mark = price ? Number(price.mark) : Number.NaN;
		const yesterday = price ? Number(price.yesterday_price) : Number.NaN;

		const display = toDisplaySymbol(market.symbol);
		const [base, quote] = display.split("/");

		return {
			symbol: display,
			pacificaSymbol: market.symbol,
			base,
			quote: quote ?? "USD",
			assetClass: classifyPacificaSymbol(market.symbol),
			instrumentType: market.instrument_type,
			maxLeverage: market.max_leverage,
			isolatedOnly: market.isolated_only,
			tickSize: Number(market.tick_size),
			lotSize: Number(market.lot_size),
			minOrderSize: Number(market.min_order_size),
			maxOrderSize: Number(market.max_order_size),

			markPrice: Number.isFinite(mark) ? mark : null,
			midPrice: price && Number.isFinite(Number(price.mid)) ? Number(price.mid) : null,
			oraclePrice: price && Number.isFinite(Number(price.oracle)) ? Number(price.oracle) : null,
			fundingRate: Number(market.funding_rate) || 0,
			nextFundingRate: Number(market.next_funding_rate) || 0,
			openInterest: price ? Number(price.open_interest) || 0 : 0,
			volume24h: price ? Number(price.volume_24h) || 0 : 0,
			// Guard the divisor: a market listed today has no yesterday.
			change24hPercent:
				Number.isFinite(mark) && Number.isFinite(yesterday) && yesterday > 0
					? ((mark - yesterday) / yesterday) * 100
					: null,
		};
	});
}

/** Case- and separator-insensitive lookup, so route params resolve. */
export function findMarket(markets: PacificaMarket[], symbol: string): PacificaMarket | undefined {
	const wanted = toPacificaSymbol(symbol).toUpperCase();
	return markets.find(
		(market) =>
			market.pacificaSymbol.toUpperCase() === wanted ||
			market.symbol.toUpperCase() === symbol.trim().toUpperCase().replace(/[-_]/g, "/"),
	);
}
