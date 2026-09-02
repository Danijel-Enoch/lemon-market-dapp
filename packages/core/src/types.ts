import type { AssetClass } from "./symbols";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop_limit" | "market_pnl";

/** A tradable Avantis market, normalised from `GET /v2/pairs`. */
export interface Market {
	pairIndex: number;
	symbol: string;
	base: string;
	quote: string;
	assetClass: AssetClass;
	/**
	 * Pyth feed symbol, e.g. "Equity.US.NVDA/USD". This is the identifier the
	 * Avantis OHLCV shim accepts — the trading symbol ("NVDA/USD") returns an
	 * empty series.
	 */
	pythSymbol: string | null;
	/** Avantis "Upside" market: no upfront fee, tiered profit share on wins. */
	isUpside: boolean;
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

/** An open Avantis position, normalised from `GET /v2/positions`. */
export interface PerpPosition {
	pairIndex: number;
	symbol: string;
	index: number;
	side: Side;
	collateralUsdc: number;
	leverage: number;
	notionalUsdc: number;
	openPrice: number;
	liquidationPrice: number | null;
	takeProfit: number | null;
	stopLoss: number | null;
	coinExposure: number | null;
	/** Unix seconds. Close intents are bound to this, so it must round-trip exactly. */
	openTimestamp: number;
}

/** A pending limit / stop-limit order. */
export interface PerpOrder {
	pairIndex: number;
	symbol: string;
	index: number;
	side: Side;
	orderType: OrderType;
	collateralUsdc: number;
	leverage: number;
	triggerPrice: number;
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
	/** Avantis pair index for the matching perp, resolved by symbol at runtime. */
	avantisPairIndex: number | null;
	avantisSymbol: string | null;
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
	/** The probe errored rather than the aggregator reporting no pool. */
	probeFailed: boolean;
	routabilityCheckedAt: number | null;
}

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

export type CarryStatus =
	| "validating"
	| "spot_filled"
	| "open"
	| "unwinding"
	| "spot_closed"
	| "closed"
	| "orphaned"
	| "failed";

export type CarryLeg = "spot" | "perp";
