export interface TokenPrice {
	address: string;
	symbol: string;
	name: string;
	priceUsd: number;
	priceChange24h?: number;
	volume24h?: number;
	marketCap?: number;
	liquidity?: number;
	source: "dexscreener" | "geckoterminal";
}

export interface DexScreenerPair {
	pairAddress: string;
	baseToken: {
		address: string;
		symbol: string;
		name: string;
	};
	quoteToken: {
		address: string;
		symbol: string;
		name: string;
	};
	priceUsd: string;
	priceChange: {
		h24: number;
	};
	volume: {
		h24: number;
	};
	marketCap?: number;
	liquidity: {
		usd: number;
	};
	dexId: string;
	chainId: string;
}

export interface GeckoTerminalPool {
	id: string;
	attributes: {
		base_token_price_usd: string;
		base_token_price_quote_token: string;
		quote_token_price_usd: string;
		base_token_price_change_percentage: {
			h24: string;
		};
		volume_usd: {
			h24: string;
		};
		market_cap_usd?: string;
		reserve_in_usd: string;
	};
	relationships: {
		base_token: {
			data: {
				id: string;
			};
		};
		quote_token: {
			data: {
				id: string;
			};
		};
	};
}

/**
 * Fetch token price from DexScreener API
 */
async function fetchFromDexScreener(
	tokenAddress: string,
	chainId: string = "bsc"
): Promise<TokenPrice | null> {
	try {
		const response = await fetch(
			`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
			{
				method: "GET",
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();

		if (!data.pairs || data.pairs.length === 0) {
			return null;
		}

		// Get the pair with highest liquidity for better price accuracy
		const bestPair = data.pairs.reduce(
			(best: DexScreenerPair, current: DexScreenerPair) => {
				const bestLiquidity = best.liquidity?.usd || 0;
				const currentLiquidity = current.liquidity?.usd || 0;
				return currentLiquidity > bestLiquidity ? current : best;
			}
		);

		return {
			address: tokenAddress,
			symbol: bestPair.baseToken.symbol,
			name: bestPair.baseToken.name,
			priceUsd: parseFloat(bestPair.priceUsd),
			priceChange24h: bestPair.priceChange?.h24,
			volume24h: bestPair.volume?.h24,
			marketCap: bestPair.marketCap,
			liquidity: bestPair.liquidity?.usd,
			source: "dexscreener"
		};
	} catch (error) {
		console.error("DexScreener API error:", error);
		return null;
	}
}

/**
 * Fetch token price from GeckoTerminal API (fallback)
 */
async function fetchFromGeckoTerminal(
	tokenAddress: string,
	chainId: string = "bsc"
): Promise<TokenPrice | null> {
	console.log("Fetching from GeckoTerminal:", tokenAddress, chainId);
	try {
		// Map chain IDs to GeckoTerminal network identifiers
		const networkMap: Record<string, string> = {
			bsc: "bsc",
			ethereum: "eth",
			polygon: "polygon_pos",
			arbitrum: "arbitrum",
			optimism: "optimism",
			avalanche: "avax",
			base: "base"
		};

		const network = networkMap[chainId] || "bsc";

		const response = await fetch(
			`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}/pools`,
			{
				method: "GET",
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`GeckoTerminal API error: ${response.status}`);
		}

		const data = await response.json();

		if (!data.data || data.data.length === 0) {
			return null;
		}

		// Get the pool with highest reserve (liquidity) for better price accuracy
		const bestPool = data.data.reduce(
			(best: GeckoTerminalPool, current: GeckoTerminalPool) => {
				const bestReserve = parseFloat(best.attributes.reserve_in_usd);
				const currentReserve = parseFloat(
					current.attributes.reserve_in_usd
				);
				return currentReserve > bestReserve ? current : best;
			}
		);

		// Get token info from included data
		const tokenInfo = data.included?.find((item: unknown) => {
			const typedItem = item as {
				type: string;
				id: string;
				attributes?: { symbol?: string; name?: string };
			};
			return (
				typedItem.type === "token" &&
				typedItem.id === bestPool.relationships.base_token.data.id
			);
		}) as { attributes?: { symbol?: string; name?: string } } | undefined;

		return {
			address: tokenAddress,
			symbol: tokenInfo?.attributes?.symbol || "UNKNOWN",
			name: tokenInfo?.attributes?.name || "Unknown Token",
			priceUsd: parseFloat(bestPool.attributes.base_token_price_usd),
			priceChange24h: parseFloat(
				bestPool.attributes.base_token_price_change_percentage.h24
			),
			volume24h: parseFloat(bestPool.attributes.volume_usd.h24),
			marketCap: bestPool.attributes.market_cap_usd
				? parseFloat(bestPool.attributes.market_cap_usd)
				: undefined,
			liquidity: parseFloat(bestPool.attributes.reserve_in_usd),
			source: "geckoterminal"
		};
	} catch (error) {
		console.error("GeckoTerminal API error:", error);
		return null;
	}
}

/**
 * Get token price with DexScreener as primary and GeckoTerminal as fallback
 */
export async function getTokenPrice(
	tokenAddress: string,
	chainId: string = "bsc"
): Promise<TokenPrice | null> {
	// Try DexScreener first
	const dexScreenerResult = await fetchFromDexScreener(tokenAddress, chainId);
	if (dexScreenerResult) {
		return dexScreenerResult;
	}

	// Fallback to GeckoTerminal
	console.log(
		`DexScreener failed for ${tokenAddress}, trying GeckoTerminal...`
	);
	const geckoTerminalResult = await fetchFromGeckoTerminal(
		tokenAddress,
		chainId
	);
	if (geckoTerminalResult) {
		return geckoTerminalResult;
	}

	console.error(`Both APIs failed for token: ${tokenAddress}`);
	return null;
}

/**
 * Get multiple token prices concurrently
 */
export async function getTokenPrices(
	tokenAddresses: string[],
	chainId: string = "bsc"
): Promise<(TokenPrice | null)[]> {
	const promises = tokenAddresses.map((address) =>
		getTokenPrice(address, chainId)
	);
	return Promise.all(promises);
}

/**
 * Get token price by pair address (DexScreener specific)
 */
export async function getTokenPriceByPair(
	pairAddress: string,
	chainId: string = "bsc"
): Promise<TokenPrice | null> {
	console.log("Fetching price by pair:", pairAddress, chainId);
	try {
		const response = await fetch(
			`https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairAddress}`,
			{
				method: "GET",
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();
		const pair = data.pairs?.[0] || data.pair;

		if (!pair) {
			return null;
		}

		return {
			address: pair.baseToken.address,
			symbol: pair.baseToken.symbol,
			name: pair.baseToken.name,
			priceUsd: parseFloat(pair.priceUsd),
			priceChange24h: pair.priceChange?.h24,
			volume24h: pair.volume?.h24,
			marketCap: pair.marketCap,
			liquidity: pair.liquidity?.usd,
			source: "dexscreener"
		};
	} catch (error) {
		console.error("Error fetching pair data:", error);
		return null;
	}
}

/**
 * Utility function to format price with appropriate decimals
 */
export function formatPrice(price: number): string {
	if (price >= 1) {
		return `$${price.toFixed(2)}`;
	} else if (price >= 0.01) {
		return `$${price.toFixed(4)}`;
	} else {
		return `$${price.toFixed(6)}`;
	}
}

/**
 * Utility function to format percentage change
 */
export function formatPriceChange(change: number): string {
	const sign = change >= 0 ? "+" : "";
	return `${sign}${change.toFixed(2)}%`;
}

/**
 * Utility function to format volume/market cap
 */
export function formatLargeNumber(num: number): string {
	if (num >= 1000000000) {
		return `$${(num / 1000000000).toFixed(2)}B`;
	} else if (num >= 1000000) {
		return `$${(num / 1000000).toFixed(2)}M`;
	} else if (num >= 1000) {
		return `$${(num / 1000).toFixed(2)}K`;
	}
	return `$${num.toFixed(2)}`;
}
