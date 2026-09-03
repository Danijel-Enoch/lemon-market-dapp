import type { AssetClass } from "./symbols";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop_limit" | "market_pnl";

/**
 * A tradable perp market.
 *
 * Keyed by symbol throughout. Venues that identify markets by a numeric index
 * are a poor fit for persistence — an index can silently point at a different
 * company after an upstream change — so nothing here stores one.
 */
export interface Market {
	symbol: string;
	base: string;
	quote: string;
	assetClass: AssetClass;
	minLeverage: number;
	maxLeverage: number;
	minPositionUsdc: number;
	openInterest: number;
	maxOpenInterest: number;
	/** Remaining OI headroom in USD; orders larger than this are rejected upstream. */
	availableOpenInterest: number;
	isListed: boolean;
	closeOnly: boolean;
	/** Equities and FX follow real market hours; crypto never closes. */
	isOpen: boolean;
	nextOpen: number | null;
	nextClose: number | null;
}

/**
 * A market joined with its live economics, as served by `GET /api/markets`.
 *
 * Defined here rather than in the API so the browser and the server share one
 * definition — a duplicated response type is how a rename on one side silently
 * becomes `undefined` on the other.
 */
export interface MarketWithEconomics extends Market {
	/** Token-list logo for the underlying, or null when none is known. */
	logoUrl: string | null;
	/** Percent per hour. Positive = you receive, negative = you pay. */
	fundingLongPercentPerHour: number;
	fundingShortPercentPerHour: number;
	longOpenInterest: number;
	shortOpenInterest: number;
	openFeePercent: number;
	closeFeePercent: number;
	spreadPercent: number;
}

/** A tokenized stock available for spot trading on Base. */
export interface StockToken {
	symbol: string;
	ticker: string;
	name: string;
	address: Address;
	decimals: number;
	/**
	 * The perp market that hedges this token, resolved by ticker at runtime.
	 *
	 * Null when nothing lists a matching perp, which is what makes the token
	 * un-hedgeable and so unavailable for cash-and-carry.
	 */
	perpSymbol: string | null;
}

/**
 * Live routability for a stock token. This is market state, not configuration:
 * only a subset of the B20 tokens currently have Aerodrome pools, and which
 * ones changes as liquidity is added.
 */
export interface TokenRoutability {
	symbol: string;
	buyable: boolean;
	sellable: boolean;
	/** Price impact of the probe trade, as a negative percentage. */
	buyPriceImpactPercent: number | null;
	/**
	 * Executable spot price in USD, derived from the buy probe.
	 *
	 * Taken from a real route rather than an oracle: the basis is the gap
	 * between what the perp marks and what the spot leg would actually fill at,
	 * and an oracle mid would quote a spread that cannot be traded.
	 */
	spotPriceUsd: number | null;
	/**
	 * The probe itself failed (rate limit, network) rather than the aggregator
	 * reporting no pool.
	 *
	 * Kept distinct because conflating the two is actively misleading: a
	 * throttled request would otherwise mark a deeply liquid token as having no
	 * liquidity at all.
	 */
	probeFailed: boolean;
	checkedAt: number;
}

/** A stock token joined with its measured routability, from `GET /api/spot/tokens`. */
export interface SpotTokenInfo extends StockToken {
	logoUrl: string | null;
	buyable: boolean;
	sellable: boolean;
	buyPriceImpactPercent: number | null;
	spotPriceUsd: number | null;
	/** The probe errored rather than the aggregator reporting no pool. */
	probeFailed: boolean;
	routabilityCheckedAt: number | null;
}

/**
 * One OHLCV bar.
 *
 * `time` is milliseconds, which is what the charting library wants; venues that
 * publish seconds are normalised at the edge rather than here, so nothing
 * downstream has to remember which unit it is holding.
 */
export interface Candle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
}

/** Chart resolutions the app offers, in minutes (or "D" for daily). */
export type Resolution = "1" | "5" | "15" | "60" | "240" | "D";

/** An executable spot quote from the KyberSwap aggregator. */
export interface SpotQuote {
	tokenIn: Address;
	tokenOut: Address;
	amountIn: string;
	amountOut: string;
	amountInUsd: number;
	amountOutUsd: number;
	priceImpactPercent: number;
	gasUsd: number;
	routerAddress: Address;
	exchanges: string[];
	/** Opaque payload handed back to `route/build`; never construct this by hand. */
	routeSummary: unknown;
}

/** An unsigned transaction, ready for `sendTransaction`. */
export interface UnsignedTx {
	to: Address;
	data: Hex;
	value: string;
	chainId: number;
}

export type BasisStatus =
	| "validating"
	| "spot_filled"
	| "open"
	| "unwinding"
	| "spot_closed"
	| "closed"
	| "orphaned"
	| "failed";

export type BasisLeg = "spot" | "perp";
