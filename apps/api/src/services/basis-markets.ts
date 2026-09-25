import type { BasisAssetClass, BasisMarket } from "@lemon/core";
import { DEFAULT_CHAIN_ID, formatUsd, requireChainInfo } from "@lemon/core";
import {
	computeBasisEconomics,
	REFERENCE_NOTIONAL_USD,
	spotPerpBasisPercent,
} from "@lemon/registry";
import { getMarkets, type MarketWithEconomics } from "./markets";
import { getSpotTokens, type SpotToken } from "./spot";

/**
 * The basis market board.
 *
 * A basis market only exists where both legs do: a Base ERC-20 the aggregator
 * can route into, and a Pacifica perp on the same underlying. Neither venue
 * knows about the other, so this join is the platform's entire inventory
 * definition — everything the app lists, prices, or trades comes from here.
 *
 * The join is by ticker, never by a stored venue index. Venue indexes are not
 * stable across protocol upgrades, and a stale one points at a different
 * company rather than at nothing — hedging a position against the wrong
 * underlying while looking perfectly healthy.
 */

/**
 * A spot leg in the registry with no perp to hedge it.
 *
 * Reported rather than dropped. These are tokens the platform is ready to list
 * the moment a perp exists — AERO and most of the Coinbase equity set among
 * them — and a symbol that is simply absent from the board is indistinguishable
 * from one nobody thought of. The pairing runs by ticker on every request, so
 * these promote themselves without a deploy.
 */
export interface UnpairedSpotAsset {
	symbol: string;
	ticker: string;
	name: string;
}

export interface BasisMarketList {
	markets: BasisMarket[];
	unpaired: UnpairedSpotAsset[];
	/**
	 * False while the first routability probe is still running.
	 *
	 * The board uses it to say "checking liquidity" rather than rendering every
	 * market as unenterable, which would be actively wrong for the ~15 seconds
	 * the first probe takes on a cold start.
	 */
	routabilityKnown: boolean;
}

/**
 * Pacifica classifies its catalog more finely than the platform needs — "index"
 * and "commodity" sit alongside "crypto" and "equity" — but only two classes
 * have a Base spot leg to pair with. Anything else is folded into crypto rather
 * than widening the type for markets that cannot exist.
 */
function toBasisAssetClass(assetClass: string): BasisAssetClass {
	return assetClass === "equity" ? "equity" : "crypto";
}

/**
 * Impact the probe may show before the pool counts as having no depth.
 *
 * Set loosely on purpose. The aggregator's impact figure folds in routing fees
 * and reads several percent on cbBTC and SOL, which are among the deepest pools
 * on Base — so a tight threshold here blocks the flagship markets while
 * catching nothing the price-divergence check does not. Only a genuinely empty
 * pool clears 10%, and at that point neither the fill price nor the reported
 * impact can be trusted.
 *
 * Impact below this is not ignored: it is charged to the position as a cost,
 * which is what makes a merely-expensive market rank badly rather than vanish
 * from the board.
 */
const MAX_PROBE_IMPACT_PERCENT = 10;

/**
 * How far the spot leg may sit from the perp mark before the pair is treated
 * as broken rather than as carrying a spread.
 *
 * Two venues pricing the same underlying should agree closely; a real basis is
 * fractions of a percent. A double-digit gap does not mean a spectacular
 * opportunity, it means one of the two prices is wrong — in practice an
 * Aerodrome pool with almost no liquidity, quoting a number no size can be
 * executed at. Presenting that as yield is the single most expensive mistake
 * this board could make, so it blocks the market instead.
 */
const MAX_PRICE_DIVERGENCE_PERCENT = 5;

/**
 * Why this pair cannot be entered right now. Empty means it can.
 *
 * `chainName` is passed rather than assumed. This board is built per chain, and
 * a blocker reading "on Base" under an X Layer board is worse than no chain at
 * all — it reads as the routability check being pointed at the wrong chain.
 */
function blockersFor(token: SpotToken, market: MarketWithEconomics, chainName: string): string[] {
	const blockers: string[] = [];

	if (token.probeFailed || token.routabilityCheckedAt === null) {
		// Distinct from "no pool": a throttled probe would otherwise mark a
		// deeply liquid market as dead.
		//
		// `routabilityCheckedAt === null` belongs here for the same reason, and
		// was the harder half to see. A token that has not been probed *at all*
		// reports `buyable: false` and `probeFailed: false` — see the `?? false`
		// defaults in `spot.ts` — which reads downstream as "the check ran and
		// found nothing", the one conclusion the data cannot support. The board
		// then told operators that every market on a healthy chain was
		// unroutable, most visibly in the window after a restart while the first
		// sweep was still running.
		blockers.push("Liquidity check failed — routability is unknown right now.");
	} else if (!token.buyable) {
		blockers.push(`No route into ${token.symbol} on ${chainName} right now.`);
	} else if (!token.sellable) {
		// Enterable but not exitable is worse than not enterable at all.
		blockers.push(
			`${token.symbol} can be bought but not sold right now — the exit is not routable.`,
		);
	}

	const impact = token.buyPriceImpactPercent;
	if (token.buyable && impact !== null && Math.abs(impact) > MAX_PROBE_IMPACT_PERCENT) {
		blockers.push(
			`${token.symbol} has almost no liquidity — a ${formatUsd(REFERENCE_NOTIONAL_USD)} trade moves it ${Math.abs(impact).toFixed(1)}%.`,
		);
	}

	if (!market.isListed || market.closeOnly) {
		blockers.push(`${market.symbol} is not accepting new positions.`);
	}
	if (market.pacifica.markPrice === null) {
		blockers.push(`${market.symbol} is not quoting a mark price.`);
	}
	if (market.availableOpenInterest <= 0) {
		blockers.push(`${market.symbol} has no open-interest headroom left.`);
	}

	// Checked last because it needs both legs priced, and an unpriced leg has
	// already produced a more specific blocker above.
	const divergence = spotPerpBasisPercent(token.spotPriceUsd, market.pacifica.markPrice);
	if (divergence !== null && Math.abs(divergence) > MAX_PRICE_DIVERGENCE_PERCENT) {
		blockers.push(
			`${token.symbol} and ${market.symbol} disagree on price by ${Math.abs(divergence).toFixed(1)}% — the spot pool is not quoting a tradable price.`,
		);
	}

	return blockers;
}

function toBasisMarket(
	token: SpotToken,
	market: MarketWithEconomics,
	chain: { id: number; name: string },
): BasisMarket {
	const chainName = chain.name;
	const funding = {
		long: market.fundingLongPercentPerHour,
		short: market.fundingShortPercentPerHour,
	};

	return {
		id: token.ticker.toUpperCase(),
		chainId: chain.id,
		ticker: token.ticker,
		name: token.name,
		assetClass: toBasisAssetClass(market.assetClass),
		logoUrl: token.logoUrl ?? market.logoUrl,

		spot: {
			symbol: token.symbol,
			address: token.address,
			decimals: token.decimals,
			priceUsd: token.spotPriceUsd,
			buyable: token.buyable,
			sellable: token.sellable,
			priceImpactPercent: token.buyPriceImpactPercent,
			probeFailed: token.probeFailed,
			checkedAt: token.routabilityCheckedAt,
		},

		perp: {
			symbol: market.symbol,
			pacificaSymbol: market.pacifica.pacificaSymbol,
			markPrice: market.pacifica.markPrice,
			maxLeverage: market.maxLeverage,
			minPositionUsdc: market.minPositionUsdc,
			lotSize: market.pacifica.lotSize,
			tickSize: market.pacifica.tickSize,
			openInterest: market.openInterest,
			availableOpenInterest: market.availableOpenInterest,
			isOpen: market.isOpen,
			fundingShortPercentPerHour: funding.short,
			fundingLongPercentPerHour: funding.long,
		},

		economics: computeBasisEconomics({
			funding,
			market,
			spotPriceUsd: token.spotPriceUsd,
			perpMarkPrice: market.pacifica.markPrice,
			spotBuyImpactPercent: token.buyPriceImpactPercent,
		}),

		blockers: blockersFor(token, market, chainName),
	};
}

/**
 * Every pair where both legs exist, ranked by net yield.
 *
 * Ranked by `netApyPercent` rather than by raw funding, because those two
 * disagree often enough to matter: a market can pay the best funding on the
 * board and still be the worst trade on it once thin-pool slippage and the
 * four fills of a round trip are priced in. Sorting by the gross number would
 * put exactly that market at the top.
 *
 * Markets with blockers are kept in the list rather than filtered out, sorted
 * last. A trader looking for a symbol that has fallen off the board cannot tell
 * an absent market from an untradable one, and the reason is what they need.
 */
export async function listBasisMarkets(
	/**
	 * Which chain's board. Defaults to this deployment's primary chain.
	 *
	 * A basis market only exists where both legs do, and the spot leg is
	 * chain-specific while the perp leg is not — Pacifica's ETH perp hedges
	 * Base's WETH, Arbitrum's WETH and X Layer's xETH equally well. So the
	 * perp catalog is shared and the spot half is scoped, which is why this
	 * takes a chain and `getMarkets` does not.
	 */
	chainId: number = DEFAULT_CHAIN_ID,
	force = false,
): Promise<BasisMarketList> {
	const chain = requireChainInfo(chainId);
	const [markets, spot] = await Promise.all([getMarkets(force), getSpotTokens(chainId, force)]);
	const bySymbol = new Map(markets.map((market) => [market.symbol, market]));

	const unpaired: UnpairedSpotAsset[] = [];
	const rows = spot.tokens.flatMap((token) => {
		const market = token.perpSymbol === null ? undefined : bySymbol.get(token.perpSymbol);
		if (!market) {
			unpaired.push({ symbol: token.symbol, ticker: token.ticker, name: token.name });
			return [];
		}
		return [toBasisMarket(token, market, chain)];
	});

	rows.sort((a, b) => {
		const blocked = Number(a.blockers.length > 0) - Number(b.blockers.length > 0);
		if (blocked !== 0) return blocked;
		return b.economics.netApyPercent - a.economics.netApyPercent;
	});

	unpaired.sort((a, b) => a.ticker.localeCompare(b.ticker));

	return { markets: rows, unpaired, routabilityKnown: spot.routabilityKnown };
}

/**
 * One market by id, on one chain.
 *
 * Accepts the underlying ticker ("NVDA"), either leg's symbol ("NVDAc",
 * "NVDA/USD", "NVDA-USD"), or any casing of them. A URL that a user pasted from
 * one venue's vocabulary should not 404 because the platform keys on the other.
 *
 * `chainId` is not cosmetic and defaulting it is not free. The spot leg is
 * chain-specific — "BTC" is a different token at a different address with
 * different liquidity on Base and on X Layer — so a lookup that ignored the
 * chain would answer an X Layer question with a Base token. Anything that then
 * built a swap from the answer would be routing the wrong asset on the wrong
 * chain, which reverts at best and fills at worst.
 */
export async function getBasisMarket(
	id: string,
	chainId: number = DEFAULT_CHAIN_ID,
): Promise<BasisMarket | undefined> {
	const target = id.trim().toUpperCase().replace("-", "/");
	const { markets } = await listBasisMarkets(chainId);

	return markets.find(
		(market) =>
			market.id === target ||
			market.spot.symbol.toUpperCase() === target ||
			market.perp.symbol.toUpperCase() === target ||
			market.perp.pacificaSymbol.toUpperCase() === target,
	);
}
