import { findMarketByTicker } from "@lemon/avantis";
import type { Market, StockToken } from "@lemon/core";
import { SPOT_TOKENS, type StockTokenSeed } from "./tokens";

/**
 * Ticker aliases where the token and the perp name the same company
 * differently.
 *
 * Alphabet is the live case: Coinbase issues `GOOGLc` (Class A, ticker GOOGL)
 * while Avantis lists the perp as `GOOG/USD` (Class C). Without this the token
 * silently fails to pair and drops out of cash-and-carry entirely — it looks
 * like the market does not exist rather than like a naming mismatch.
 */
const TICKER_ALIASES: Record<string, string[]> = {
	GOOGL: ["GOOG"],
	GOOG: ["GOOGL"],
};

function resolveMarket(markets: Market[], ticker: string): Market | undefined {
	const direct = findMarketByTicker(markets, ticker);
	if (direct) return direct;

	for (const alias of TICKER_ALIASES[ticker.toUpperCase()] ?? []) {
		const aliased = findMarketByTicker(markets, alias);
		if (aliased) return aliased;
	}
	return undefined;
}

/**
 * Join the stock-token registry to the live Avantis catalog by ticker.
 *
 * The join is by symbol, never by a stored pair index: Avantis pair indexes are
 * not stable across protocol versions, so a persisted index can silently point
 * at a different company after an upgrade.
 */
export function pairTokensWithMarkets(
	markets: Market[],
	tokens: readonly StockTokenSeed[] = SPOT_TOKENS,
): StockToken[] {
	return tokens.map((token) => {
		const market = resolveMarket(markets, token.ticker);
		return {
			symbol: token.symbol,
			ticker: token.ticker,
			name: token.name,
			address: token.address,
			decimals: token.decimals,
			avantisPairIndex: market?.pairIndex ?? null,
			avantisSymbol: market?.symbol ?? null,
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
	const byIndex = new Map(markets.map((market) => [market.pairIndex, market]));

	return tokens.flatMap((token) => {
		if (token.avantisPairIndex === null) return [];
		const market = byIndex.get(token.avantisPairIndex);
		if (!market || !market.isListed || market.closeOnly) return [];
		if (!isBuyable(token.symbol)) return [];
		return [{ token, market }];
	});
}
