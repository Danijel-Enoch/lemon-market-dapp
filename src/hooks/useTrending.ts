import { betterFetch } from "@better-fetch/fetch";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

export type TrendingType = "tokens" | "fx" | "stocks";

export interface TrendingOptions {
	type: TrendingType;
	limit?: number;
	page?: number;
	chain?: string;
	sort?: string;
	hasMarket?: boolean;
}

export interface TokenItem {
	id: number;
	symbol: string;
	name: string;
	priceUsd: number | null;
	change24h: number;
	volume24h: number;
	liquidityUsd: number;
	marketCap: number | null;
	trend: "up" | "down";
	logo: string | null;
	pairAddress: string | null;
	tokenAddress: string | null;
	dexId: string | null;
	chainId: string;
	chain: string;
	hasMarket: boolean;
	marketId: string | null;
	marketContractAddress: string | null;
	exposure: {
		totalExposure: number;
		totalLong: number;
		totalShort: number;
	};
}

export interface FXItem {
	ticker: string;
	price: number;
	timestamp: string;
	source: string;
	error?: string;
	MarketCap?: number;
	Liquidity?: number;
	change24h?: number;
	volume24h?: number;
}

export interface StockItem {
	symbol: string;
	type: string;
	price: number;
	timestamp: string;
	source: string;
	error?: string;
	MarketCap?: number;
	Liquidity?: number;
	change24h?: number;
	volume24h?: number;
}

export type TrendingItem = TokenItem | FXItem | StockItem;

export interface TrendingResult {
	data: TrendingItem[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
}

export function useTrending(options: TrendingOptions, skip: boolean = false) {
	const {
		data: value,
		isLoading: loading,
		error,
		refetch
	} = useQuery({
		queryKey: ["trending", options],
		queryFn: async () => {
			const { type, limit = 30, page = 1, ...params } = options;

			switch (type) {
				case "tokens":
					return await fetchTokensTrending({
						limit,
						page,
						...params
					});
				case "fx":
					return await fetchFXTrending({ limit });
				case "stocks":
					return await fetchStocksTrending({ limit });
				default:
					throw new Error(`Unsupported trending type: ${type}`);
			}
		},
		enabled: !skip,
		staleTime: 30000 // 30 seconds
	});

	const handleRefetch = useCallback(
		(_newOptions?: TrendingOptions) => {
			// If new options are provided, we can't easily "refetch" with new options using the same hook instance
			// without changing the state that drives the hook.
			// However, for compatibility with the existing interface which accepted options in refetch,
			// we might need to rely on the parent component updating the options prop.
			// But the previous implementation allowed passing options to refetch.
			// Given the usage pattern, it's better to just call refetch() and let the query key handle updates if props change.
			// If the caller passes arguments to refetch, it implies they want to change the query.
			// But useQuery is declarative.
			// For now, we'll just expose the standard refetch.
			refetch();
		},
		[refetch]
	);

	return {
		data: value?.data || [],
		pagination: value?.pagination,
		loading,
		error: error?.message || null,
		refetch: handleRefetch
	};
}

const BASE_URL =
	import.meta.env.VITE_API_BASE_URL || "https://api.lemonmarkets.xyz";

async function fetchTokensTrending(params: {
	limit: number;
	page: number;
	chain?: string;
	sort?: string;
	hasMarket?: boolean;
}): Promise<TrendingResult> {
	const {
		limit,
		page,
		chain = "base",
		sort = "liquidity",
		hasMarket
	} = params;

	const queryParams = new URLSearchParams({
		limit: limit.toString(),
		page: page.toString(),
		chain,
		sort
	});

	// if (hasMarket !== undefined) {
	// 	queryParams.append("hasMarket", hasMarket.toString());
	// }

	try {
		const { data, error } = await betterFetch<TrendingResult>(
			`${BASE_URL}/trending/tokens/all`,
			{
				method: "GET"
			}
		);
		if (error) {
			throw new Error("Failed to fetch trending tokens");
		}
		return {
			data: data?.data || [],
			pagination: data?.pagination
		};
	} catch {
		return { data: [] };
	}
}

async function fetchFXTrending({
	limit
}: {
	limit: number;
}): Promise<TrendingResult> {
	try {
		const { data, error } = await betterFetch<TrendingResult>(
			`${BASE_URL}/trending/fx?limit=${limit}`,
			{
				method: "GET"
			}
		);
		if (error) {
			throw new Error("Failed to fetch trending FX");
		}
		return {
			data: data?.data || [],
			pagination: data?.pagination
		};
	} catch {
		return { data: [] };
	}
}

async function fetchStocksTrending({
	limit
}: {
	limit: number;
}): Promise<TrendingResult> {
	try {
		const { data, error } = await betterFetch<TrendingResult>(
			`${BASE_URL}/trending/stocks?limit=${limit}`,
			{
				method: "GET"
			}
		);
		if (error) {
			throw new Error("Failed to fetch trending stocks");
		}
		return {
			data: data?.data || [],
			pagination: data?.pagination
		};
	} catch {
		return { data: [] };
	}
}

/**
 * Fetch price for a specific FX pair
 * Used by position API for opening/closing positions
 * @param ticker - FX pair ticker (e.g., "AUD-USD")
 * @returns Price data with timestamp
 */
async function fetchFXPrice(ticker: string) {
	try {
		const { data, error } = await betterFetch<{
			price: number;
			timestamp: string;
			source: string;
			priceUsd?: number;
			lastUpdate?: string;
		}>(`${BASE_URL}/trending/fx/${ticker}`, {
			method: "GET"
		});

		if (error) {
			throw new Error(`Failed to fetch price for ${ticker}`);
		}

		return {
			success: true,
			ticker,
			symbol: ticker,
			price: data?.price || 0,
			timestamp: data?.timestamp,
			source: data?.source,
			priceUsd: data?.priceUsd || 0,
			lastUpdate: data?.lastUpdate
		};
	} catch (error) {
		return {
			success: false,
			ticker,
			symbol: ticker,
			error:
				error instanceof Error ? error.message : "Failed to fetch price"
		};
	}
}

/**
 * Fetch price for a specific stock symbol
 * Used by position API for opening/closing positions
 * @param symbol - Stock symbol (e.g., "AAPL")
 * @returns Price data with timestamp
 */
async function fetchStockPrice(symbol: string) {
	try {
		const { data, error } = await betterFetch<{
			price: number;
			timestamp: string;
			source: string;
			priceUsd?: number;
			lastUpdate?: string;
		}>(`${BASE_URL}/trending/stocks/${symbol}`, {
			method: "GET"
		});

		if (error) {
			throw new Error(`Failed to fetch price for ${symbol}`);
		}

		return {
			success: true,
			symbol,
			price: data?.price || 0,
			timestamp: data?.timestamp,
			source: data?.source,
			priceUsd: data?.priceUsd || 0,
			lastUpdate: data?.lastUpdate
		};
	} catch (error) {
		return {
			success: false,
			symbol,
			error:
				error instanceof Error ? error.message : "Failed to fetch price"
		};
	}
}

export {
	fetchTokensTrending,
	fetchFXTrending,
	fetchStocksTrending,
	fetchFXPrice,
	fetchStockPrice
};

/**
 * Search response type for token search endpoints
 */
export interface TokenSearchResponse {
	success: boolean;
	data: TokenItem[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
	timestamp?: string;
}

/**
 * Search tokens by symbol
 * @param symbol - Token symbol to search for (e.g., "ETH", "USDC")
 * @returns Search results with matching tokens
 */
async function searchTokensBySymbol(
	symbol: string
): Promise<TokenSearchResponse> {
	try {
		const { data, error } = await betterFetch<TokenSearchResponse>(
			`${BASE_URL}/trending/tokens/search/by-symbol/${encodeURIComponent(
				symbol
			)}`,
			{
				method: "GET"
			}
		);
		if (error) {
			throw new Error("Failed to search tokens by symbol");
		}
		return {
			success: data?.success ?? true,
			data: data?.data || [],
			pagination: data?.pagination,
			timestamp: data?.timestamp
		};
	} catch {
		return { success: false, data: [] };
	}
}

/**
 * Search tokens by contract address or pair address
 * @param address - Token or pair address to search for (0x...)
 * @returns Search results with matching tokens
 */
async function searchTokensByAddress(
	address: string
): Promise<TokenSearchResponse> {
	try {
		const { data, error } = await betterFetch<TokenSearchResponse>(
			`${BASE_URL}/trending/tokens/search/by-address/${encodeURIComponent(
				address
			)}`,
			{
				method: "GET"
			}
		);
		if (error) {
			throw new Error("Failed to search tokens by address");
		}
		return {
			success: data?.success ?? true,
			data: data?.data || [],
			pagination: data?.pagination,
			timestamp: data?.timestamp
		};
	} catch {
		return { success: false, data: [] };
	}
}

/**
 * Unified search function that detects whether to search by address or symbol
 * @param query - Search query (address starting with 0x or symbol/name)
 * @returns Search results
 */
async function searchTokens(query: string): Promise<TokenSearchResponse> {
	const trimmedQuery = query.trim();

	// Check if query is an address (starts with 0x and has sufficient length)
	const isAddress =
		trimmedQuery.startsWith("0x") && trimmedQuery.length >= 40;

	if (isAddress) {
		return searchTokensByAddress(trimmedQuery);
	}

	return searchTokensBySymbol(trimmedQuery);
}

export { searchTokensBySymbol, searchTokensByAddress, searchTokens };
