import type { Market, StockToken } from "@lemon/core";
import type { StockTokenSeed } from "./tokens";

/**
 * Ticker aliases where the token and the perp name the same company
 * differently.
 *
 * Alphabet is the live case: Coinbase issues `GOOGLc` (Class A, ticker GOOGL)
 * while a venue may list the perp against Class C as `GOOG`. Without this the
 * token silently fails to pair and drops out of cash-and-carry entirely — it
 * looks like the market does not exist rather than like a naming mismatch.
 */
const TICKER_ALIASES: Record<string, string[]> = {
	GOOGL: ["GOOG"],
	GOOG: ["GOOGL"],
};

/**
 * The least a market has to expose to be paired with a token.
 *
 * Narrower than `Market` so the pairing can run against a raw venue catalog —
 * the seed script has one of those and no reason to build a full `Market`.
 */
export interface PerpMarketRef {
	symbol: string;
	base: string;
	quote: string;
}

/** Find the USD-quoted market for a ticker, e.g. "NVDA" → NVDA/USD. */
export function findMarketByTicker<T extends PerpMarketRef>(
	markets: readonly T[],
	ticker: string,
): T | undefined {
	const target = ticker.trim().toUpperCase();
	return markets.find((market) => market.base.toUpperCase() === target && market.quote === "USD");
}

function resolveMarket<T extends PerpMarketRef>(
	markets: readonly T[],
	ticker: string,
): T | undefined {
	const direct = findMarketByTicker(markets, ticker);
	if (direct) return direct;

	for (const alias of TICKER_ALIASES[ticker.toUpperCase()] ?? []) {
		const aliased = findMarketByTicker(markets, alias);
		if (aliased) return aliased;
	}
	return undefined;
}

/**
 * Join the stock-token registry to the live perp catalog by ticker.
 *
 * The join is by symbol, never by a stored index. Venue indexes are not stable
 * across protocol versions, so a persisted one can end up pointing at a
 * different company after an upgrade — a silent failure that would hedge a
 * position against the wrong underlying.
 */
export function pairTokensWithMarkets(
	markets: readonly PerpMarketRef[],
	/**
	 * The tokens to pair. **Required, and one chain's.**
	 *
	 * It used to default to the whole registry, which was right while the
	 * registry was one chain. It is now actively wrong: `WETH` on Base,
	 * `WETH` on Arbitrum and `xETH` on X Layer are three different contracts
	 * that all pair to the ETH perp, so pairing the flat list would return
	 * three markets named ETH and leave the caller to guess which chain each
	 * belonged to. Callers pass `spotTokensFor(chainId)`.
	 */
	tokens: readonly StockTokenSeed[],
): StockToken[] {
	return tokens.map((token) => {
		const market = resolveMarket(markets, token.ticker);
		return {
			symbol: token.symbol,
			ticker: token.ticker,
			name: token.name,
			address: token.address,
			decimals: token.decimals,
			perpSymbol: market?.symbol ?? null,
		};
	});
}

export interface CarryCandidate {
	token: StockToken;
	market: Market;
}

/**
 * Symbols where both legs of a cash-and-carry can actually be executed: a spot
 * token with a buy route, and a listed, open perp market to short against it.
 */
export function findCarryCandidates(
	tokens: StockToken[],
	markets: Market[],
	isBuyable: (symbol: string) => boolean,
): CarryCandidate[] {
	const bySymbol = new Map(markets.map((market) => [market.symbol, market]));

	return tokens.flatMap((token) => {
		if (token.perpSymbol === null) return [];
		const market = bySymbol.get(token.perpSymbol);
		if (!market || !market.isListed || market.closeOnly) return [];
		if (!isBuyable(token.symbol)) return [];
		return [{ token, market }];
	});
}
