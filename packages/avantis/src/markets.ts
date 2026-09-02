import type { AssetClass, Market } from "@lemon/core";
import { isTradableAssetClass, normalizePairSymbol } from "@lemon/core";
import type { RawPair } from "./types";

const ASSET_CLASSES: Record<string, AssetClass> = {
	equity: "equity",
	fx: "fx",
	crypto: "crypto",
	commodity: "commodity",
	metal: "metal",
	index: "index",
};

function toAssetClass(raw: string | undefined): AssetClass {
	if (!raw) return "unknown";
	return ASSET_CLASSES[raw.toLowerCase()] ?? "unknown";
}

/**
 * Avantis reports schedule times as 0 when a market never closes. Surfacing 0
 * as a timestamp would render as 1970, so it becomes null.
 */
function optionalTimestamp(value: number | undefined): number | null {
	return value && value > 0 ? value : null;
}

export function normalizeMarket(raw: RawPair): Market {
	// Detect Upside pairs from the RAW symbol: normalisation rewrites "_" to
	// "/", so "BTC_UPSIDE/USD" would become "BTC/UPSIDE/USD" and never match.
	const isUpside = /_UPSIDE/i.test(raw.symbol);
	const symbol = normalizePairSymbol(raw.symbol);
	const schedule = raw.schedule ?? raw.feed?.attributes;
	const openInterest = raw.pairOI ?? 0;
	const maxOpenInterest = raw.pairMaxOI ?? 0;

	return {
		pairIndex: raw.index,
		symbol,
		base: raw.from,
		quote: raw.to,
		assetClass: toAssetClass(raw.feed?.attributes?.assetType),
		pythSymbol: raw.feed?.attributes?.symbol ?? null,
		isUpside,
		minLeverage: raw.leverages?.minLeverage ?? 1,
		maxLeverage: raw.leverages?.maxLeverage ?? 1,
		minPositionUsdc: raw.pairMinLevPosUSDC ?? 0,
		openInterest,
		maxOpenInterest,
		availableOpenInterest: Math.max(0, maxOpenInterest - openInterest),
		isListed: raw.isPairListed !== false,
		closeOnly: raw.closeOnly === true,
		isOpen: schedule?.isOpen === true,
		nextOpen: optionalTimestamp(schedule?.nextOpen),
		nextClose: optionalTimestamp(schedule?.nextClose),
	};
}

/** Ordering for the market list: crypto first, then RWAs by class. */
const CLASS_ORDER: Record<string, number> = {
	crypto: 0,
	equity: 1,
	fx: 2,
	commodity: 3,
	metal: 4,
	index: 5,
	unknown: 6,
};

/**
 * The tradable catalog: every listed Avantis market.
 *
 * Filtered by listing status rather than a hardcoded symbol list, so newly
 * listed markets appear on their own and delisted ones drop out with no code
 * change.
 *
 * `_UPSIDE` pairs are excluded. They are a distinct product — no upfront fee,
 * a tiered profit share on wins — and they require different order-type
 * discriminators on submission. Listing them beside the standard pairs would
 * let a user open one expecting normal fee mechanics.
 */
export function selectTradableMarkets(raw: RawPair[]): Market[] {
	return raw
		.map(normalizeMarket)
		.filter(
			(market) => isTradableAssetClass(market.assetClass) && market.isListed && !market.isUpside,
		)
		.sort((a, b) => {
			const order = (CLASS_ORDER[a.assetClass] ?? 9) - (CLASS_ORDER[b.assetClass] ?? 9);
			return order !== 0 ? order : a.symbol.localeCompare(b.symbol);
		});
}

/** Resolve a market by symbol. Pair indexes are never hardcoded — see symbols.ts. */
export function findMarketBySymbol(markets: Market[], symbol: string): Market | undefined {
	const target = normalizePairSymbol(symbol);
	return markets.find((market) => market.symbol === target);
}

/** Resolve the perp market for a stock ticker, e.g. "NVDA" -> NVDA/USD. */
export function findMarketByTicker(markets: Market[], ticker: string): Market | undefined {
	const target = ticker.trim().toUpperCase();
	return markets.find((market) => market.base.toUpperCase() === target && market.quote === "USD");
}

export interface OrderValidation {
	ok: boolean;
	errors: string[];
}

/**
 * Pre-flight the constraints the tx-builder would otherwise reject on, so the
 * user sees a specific reason before a wallet prompt rather than a revert after.
 */
export function validateOrder(
	market: Market,
	input: { collateralUsdc: number; leverage: number },
): OrderValidation {
	const errors: string[] = [];
	const notional = input.collateralUsdc * input.leverage;

	if (!market.isListed) errors.push(`${market.symbol} is not listed.`);
	if (market.closeOnly) errors.push(`${market.symbol} is close-only right now.`);
	if (!market.isOpen) {
		const when = market.nextOpen
			? ` Reopens ${new Date(market.nextOpen * 1000).toUTCString()}.`
			: "";
		errors.push(`${market.symbol} is closed.${when}`);
	}
	if (input.leverage < market.minLeverage || input.leverage > market.maxLeverage) {
		errors.push(`Leverage must be between ${market.minLeverage}x and ${market.maxLeverage}x.`);
	}
	if (notional < market.minPositionUsdc) {
		errors.push(`Minimum position size is $${market.minPositionUsdc}.`);
	}
	if (market.availableOpenInterest > 0 && notional > market.availableOpenInterest) {
		errors.push(
			`Only $${Math.floor(market.availableOpenInterest).toLocaleString()} of open interest left on ${market.symbol}.`,
		);
	}

	return { ok: errors.length === 0, errors };
}
