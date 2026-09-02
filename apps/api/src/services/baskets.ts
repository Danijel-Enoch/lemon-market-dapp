import type { Candle, Resolution } from "@lemon/avantis";
import type { AssetClass } from "@lemon/core";
import {
	BASKETS,
	type BasketDefinition,
	buildIndexSeries,
	findBasket,
	type IndexPoint,
	indexChangePercent,
	splitEqually,
} from "@lemon/registry";
import { clients } from "../config";
import { getMarkets } from "./markets";
import { getSpotTokens } from "./spot";

export interface BasketLegStatus {
	marketSymbol: string;
	ticker: string;
	pairIndex: number | null;
	logoUrl: string | null;
	maxLeverage: number;
	minPositionUsdc: number;
	isOpen: boolean;
	/** Perp leg is tradable. */
	perpAvailable: boolean;
	/** A Base token exists with a live buy route. */
	spotAvailable: boolean;
	/** Routability has not been probed yet — availability is unknown, not false. */
	spotPending: boolean;
	spotSymbol: string | null;
	fundingShortPercentPerHour: number;
}

export interface BasketSummary {
	id: string;
	name: string;
	description: string;
	assetClass: AssetClass;
	legs: BasketLegStatus[];
	perpLegCount: number;
	spotLegCount: number;
	/**
	 * True when every perp leg also has a spot leg. When false the spot and
	 * carry versions cover fewer assets than the perp version, which the UI
	 * must state rather than silently deliver a different basket.
	 */
	legsMatch: boolean;
	/** Legs that exist on the perp side but cannot be bought spot. */
	perpOnlyTickers: string[];
	/**
	 * False while the first routability probe is still running.
	 *
	 * Without this the UI would state that BTC, ETH and SOL have no token on
	 * Base during the few seconds before the probe lands — actively false, and
	 * about markets that are in fact the deepest ones available.
	 */
	routabilityKnown: boolean;
}

async function describe(basket: BasketDefinition): Promise<BasketSummary> {
	const [markets, spot] = await Promise.all([getMarkets(), getSpotTokens()]);

	const legs: BasketLegStatus[] = basket.legs.map((leg) => {
		const market = markets.find((candidate) => candidate.symbol === leg.marketSymbol);
		const token = spot.tokens.find(
			(candidate) => candidate.ticker === leg.ticker && candidate.buyable,
		);

		return {
			marketSymbol: leg.marketSymbol,
			ticker: leg.ticker,
			pairIndex: market?.pairIndex ?? null,
			logoUrl: market?.logoUrl ?? token?.logoUrl ?? null,
			maxLeverage: market?.maxLeverage ?? 1,
			minPositionUsdc: market?.minPositionUsdc ?? 0,
			isOpen: market?.isOpen ?? false,
			perpAvailable: Boolean(market?.isListed && !market.closeOnly),
			spotAvailable: Boolean(token),
			spotPending: !spot.routabilityKnown,
			spotSymbol: token?.symbol ?? null,
			fundingShortPercentPerHour: market?.fundingShortPercentPerHour ?? 0,
		};
	});

	const perpLegs = legs.filter((leg) => leg.perpAvailable);
	const spotLegs = legs.filter((leg) => leg.spotAvailable);

	return {
		id: basket.id,
		name: basket.name,
		description: basket.description,
		assetClass: basket.assetClass,
		legs,
		perpLegCount: perpLegs.length,
		spotLegCount: spotLegs.length,
		legsMatch:
			!spot.routabilityKnown || (perpLegs.length === spotLegs.length && perpLegs.length > 0),
		// Only claim a leg is perp-only once we have actually measured routes.
		perpOnlyTickers: spot.routabilityKnown
			? perpLegs.filter((leg) => !leg.spotAvailable).map((leg) => leg.ticker)
			: [],
		routabilityKnown: spot.routabilityKnown,
	};
}

export async function listBaskets(): Promise<BasketSummary[]> {
	return Promise.all(BASKETS.map(describe));
}

export async function getBasket(id: string): Promise<BasketSummary | undefined> {
	const basket = findBasket(id);
	return basket ? describe(basket) : undefined;
}

export interface BasketIndex {
	points: IndexPoint[];
	changePercent: number;
	/** Legs actually included — a leg with no history is dropped, not faked. */
	included: string[];
	missing: string[];
}

/**
 * Composite index chart for a basket.
 *
 * Each leg's candles are fetched, then combined by `buildIndexSeries`, which
 * rebases every series before averaging so a high-priced leg cannot dominate.
 */
export async function getBasketIndex(
	id: string,
	resolution: Resolution,
	from: number,
	to: number,
): Promise<BasketIndex | undefined> {
	const basket = findBasket(id);
	if (!basket) return undefined;

	const markets = await getMarkets();
	const included: string[] = [];
	const missing: string[] = [];
	const series: Candle[][] = [];

	await Promise.all(
		basket.legs.map(async (leg) => {
			const market = markets.find((candidate) => candidate.symbol === leg.marketSymbol);
			if (!market?.pythSymbol) {
				missing.push(leg.ticker);
				return;
			}
			const candles = await clients.avantisFeed
				.getCandles({ pythSymbol: market.pythSymbol, resolution, from, to })
				.catch(() => [] as Candle[]);

			if (candles.length === 0) {
				missing.push(leg.ticker);
				return;
			}
			included.push(leg.ticker);
			series.push(candles);
		}),
	);

	const points = buildIndexSeries(series);
	return { points, changePercent: indexChangePercent(points), included, missing };
}

export interface BasketPlanLeg {
	marketSymbol: string;
	ticker: string;
	spotSymbol: string | null;
	notionalUsd: number;
	collateralUsd: number;
	tradable: boolean;
	reason: string | null;
}

export interface BasketPlan {
	basketId: string;
	venue: "perp" | "spot";
	totalUsd: number;
	leverage: number;
	legs: BasketPlanLeg[];
	tradableLegs: number;
	/** Total that will actually be deployed once untradable legs are dropped. */
	effectiveUsd: number;
	warnings: string[];
}

/**
 * Size an equal-weighted basket entry.
 *
 * Untradable legs are reported rather than silently redistributed: quietly
 * spreading a missing leg's share across the others changes the basket the user
 * asked for, and they should decide whether that is acceptable.
 */
export async function planBasket(params: {
	basketId: string;
	venue: "perp" | "spot";
	totalUsd: number;
	leverage: number;
}): Promise<BasketPlan | undefined> {
	const summary = await getBasket(params.basketId);
	if (!summary) return undefined;

	const perLeg = splitEqually(params.totalUsd, summary.legs.length);
	const warnings: string[] = [];

	const legs: BasketPlanLeg[] = summary.legs.map((leg) => {
		const available = params.venue === "perp" ? leg.perpAvailable : leg.spotAvailable;
		let reason: string | null = null;

		if (!available) {
			reason =
				params.venue === "perp"
					? `${leg.ticker} is not listed on Avantis`
					: `${leg.ticker} has no buy route on Base`;
		} else if (params.venue === "perp" && !leg.isOpen) {
			reason = `${leg.ticker} market is closed`;
		} else if (params.venue === "perp" && perLeg * params.leverage < leg.minPositionUsdc) {
			reason = `${leg.ticker} needs at least $${leg.minPositionUsdc} per leg`;
		}

		return {
			marketSymbol: leg.marketSymbol,
			ticker: leg.ticker,
			spotSymbol: leg.spotSymbol,
			notionalUsd: perLeg,
			collateralUsd: params.venue === "perp" ? perLeg / params.leverage : perLeg,
			tradable: reason === null,
			reason,
		};
	});

	const tradable = legs.filter((leg) => leg.tradable);
	if (tradable.length < legs.length) {
		warnings.push(
			`${legs.length - tradable.length} of ${legs.length} legs cannot be traded right now; only the rest will be entered.`,
		);
	}
	if (params.venue === "spot" && summary.perpOnlyTickers.length > 0) {
		const tickers = summary.perpOnlyTickers;
		warnings.push(
			`${tickers.join(", ")} ${tickers.length === 1 ? "exists" : "exist"} as a perp but ${tickers.length === 1 ? "has" : "have"} no Base token, so the spot basket holds fewer assets than the perp basket.`,
		);
	}

	return {
		basketId: summary.id,
		venue: params.venue,
		totalUsd: params.totalUsd,
		leverage: params.leverage,
		legs,
		tradableLegs: tradable.length,
		effectiveUsd: tradable.reduce((sum, leg) => sum + leg.notionalUsd, 0),
		warnings,
	};
}
