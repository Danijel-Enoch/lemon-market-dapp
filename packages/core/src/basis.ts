import type { Address } from "./types";

/**
 * The two families of underlying the platform lists.
 *
 * They are not cosmetic labels. An equity perp keeps exchange hours while its
 * token trades on Base continuously, so an equity basis has windows where one
 * leg is frozen; a crypto basis never does. Every place that has to warn about
 * a half-tradable position branches on this.
 */
export type BasisAssetClass = "equity" | "crypto";

/** The spot leg: a real ERC-20 on Base, bought through the aggregator. */
export interface BasisSpotLeg {
	/** On-chain symbol, which is not the ticker — "NVDAc" for NVDA, "cbBTC" for BTC. */
	symbol: string;
	address: Address;
	decimals: number;
	/** Executable price from a live route, not an oracle mid. Null when unrouted. */
	priceUsd: number | null;
	buyable: boolean;
	sellable: boolean;
	/** Measured on a probe trade, as a negative percent. */
	priceImpactPercent: number | null;
	/** The probe errored rather than the aggregator reporting no pool. */
	probeFailed: boolean;
	checkedAt: number | null;
}

/** The perp leg: a Pacifica market, shorted against the spot holding. */
export interface BasisPerpLeg {
	/** Display symbol, e.g. "NVDA/USD". */
	symbol: string;
	/** What Pacifica accepts on the wire, e.g. "NVDA". */
	pacificaSymbol: string;
	markPrice: number | null;
	maxLeverage: number;
	minPositionUsdc: number;
	lotSize: number;
	tickSize: number;
	openInterest: number;
	availableOpenInterest: number;
	isOpen: boolean;
	/** Percent per hour. Positive = you receive, negative = you pay. */
	fundingShortPercentPerHour: number;
	fundingLongPercentPerHour: number;
}

/**
 * What a basis market pays, and what it costs to collect.
 *
 * Every figure is quoted at `referenceNotionalUsd` and `referenceLeverage` so
 * rows on the board are comparable. A position sized differently is re-priced
 * before it is opened — these are for ranking, not for committing.
 */
export interface BasisEconomics {
	/**
	 * `(perp mark - spot) / spot`, percent. Positive means the perp is rich to
	 * spot, which is the direction that pays a long-spot/short-perp holder as
	 * the two converge.
	 *
	 * Null when either leg has no price, which is not the same as zero: an
	 * unpriced market is unknown, and rendering it as flat would invite a trade
	 * into a market nobody can quote.
	 */
	basisPercent: number | null;
	/** Short-side funding, percent per hour. This is what the position accrues. */
	fundingShortPercentPerHour: number;
	/** Annualised short-side funding, as a percent of notional. */
	fundingAprPercent: number;
	/** Annualised funding as a percent of capital actually deployed. */
	fundingApyPercent: number;
	/** Entry + exit fees and slippage, as a percent of notional. */
	roundTripCostPercent: number;
	/** Net yield on deployed capital after amortising the round trip over a year. */
	netApyPercent: number;
	/** Days of funding needed to cover the round trip. Null when funding is negative. */
	breakevenDays: number | null;
	referenceNotionalUsd: number;
	referenceLeverage: number;
}

/**
 * One tradable spot-vs-perp pair — the platform's unit of inventory.
 *
 * Keyed by the underlying's ticker rather than by either leg's symbol, because
 * the two legs spell the same company differently ("NVDAc" on Base, "NVDA/USD"
 * on Pacifica) and a URL built from one of them would break the moment a venue
 * renamed its listing.
 */
export interface BasisMarket {
	/** URL-safe identifier: the underlying ticker, e.g. "NVDA", "BTC", "AERO". */
	id: string;
	/**
	 * The chain the spot leg lives on.
	 *
	 * Part of the market's identity rather than context the caller is expected to
	 * remember. "BTC" on Base and "BTC" on X Layer are different markets — a
	 * different token at a different address with different liquidity — that
	 * happen to share a perp, and a caller holding a `BasisMarket` with no chain
	 * on it has to reconstruct which board it came from before it can trade. The
	 * perp leg has no chain of its own: there is one Pacifica, on Solana, whatever
	 * the spot side was bought on.
	 */
	chainId: number;
	ticker: string;
	name: string;
	assetClass: BasisAssetClass;
	logoUrl: string | null;
	spot: BasisSpotLeg;
	perp: BasisPerpLeg;
	economics: BasisEconomics;
	/**
	 * Why this market cannot be entered right now. Empty means it can.
	 *
	 * Carried on the market rather than discovered at submit time so the board
	 * can show an honest reason next to a row instead of hiding it, or worse,
	 * offering a button that fails.
	 */
	blockers: string[];
}
