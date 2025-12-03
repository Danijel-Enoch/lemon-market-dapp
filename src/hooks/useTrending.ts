import { useCallback, useEffect } from "react";
import useAsyncFn from "react-use/lib/useAsyncFn";

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
}

export interface FXItem {
	ticker: string;
	price: number;
	timestamp: string;
	source: string;
	error?: string;
	MarketCap?: number;
	Liquidity?: number;
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
	const [{ loading, error, value }, fetchTrending] = useAsyncFn(
		async (options: TrendingOptions): Promise<TrendingResult> => {
			const { type, limit = 30, page = 1, ...params } = options;

			switch (type) {
				case "tokens":
					return await fetchTokensTrending({ limit, page, ...params });
				case "fx":
					return await fetchFXTrending({ limit });
				case "stocks":
					return await fetchStocksTrending({ limit });
				default:
					throw new Error(`Unsupported trending type: ${type}`);
			}
		},
		[],
	);

	useEffect(() => {
		if (!skip) {
			fetchTrending(options);
		}
	}, [skip, options, fetchTrending]);

	const refetch = useCallback(
		(newOptions: TrendingOptions) => {
			fetchTrending(newOptions);
		},
		[fetchTrending],
	);

	return {
		data: value?.data || [],
		pagination: value?.pagination,
		loading,
		error: error?.message || null,
		refetch,
	};
}

const BASE_URL = "https://api.lemonmarkets.xyz";

async function fetchTokensTrending(params: {
	limit: number;
	page: number;
	chain?: string;
	sort?: string;
	hasMarket?: boolean;
}): Promise<TrendingResult> {
	const { limit, page, chain = "base", sort = "liquidity", hasMarket } = params;

	const queryParams = new URLSearchParams({
		limit: limit.toString(),
		page: page.toString(),
		chain,
		sort,
	});

	if (hasMarket !== undefined) {
		queryParams.append("hasMarket", hasMarket.toString());
	}

	try {
		const response = await fetch(`${BASE_URL}/trending/tokens?${queryParams.toString()}`);
		if (!response.ok) {
			throw new Error("Failed to fetch trending tokens");
		}
		const data = await response.json();
		return {
			data: data.data,
			pagination: data.pagination,
		};
	} catch (error) {
		console.error("Error fetching trending tokens:", error);
		return { data: [] };
	}
}

async function fetchFXTrending({ limit }: { limit: number }): Promise<TrendingResult> {
	try {
		const response = await fetch(`${BASE_URL}/trending/fx?limit=${limit}`);
		if (!response.ok) {
			throw new Error("Failed to fetch trending FX");
		}
		const data = await response.json();
		return {
			data: data.data,
			pagination: data.pagination,
		};
	} catch (error) {
		console.error("Error fetching trending FX:", error);
		return { data: [] };
	}
}

async function fetchStocksTrending({ limit }: { limit: number }): Promise<TrendingResult> {
	try {
		const response = await fetch(`${BASE_URL}/trending/stocks?limit=${limit}`);
		if (!response.ok) {
			throw new Error("Failed to fetch trending stocks");
		}
		const data = await response.json();
		return {
			data: data.data,
			pagination: data.pagination,
		};
	} catch (error) {
		console.error("Error fetching trending stocks:", error);
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
		const response = await fetch(`${BASE_URL}/trending/fx/${ticker}`);

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${ticker}`);
		}

		const data = await response.json();

		return {
			success: true,
			ticker,
			symbol: ticker,
			price: data.price || 0,
			timestamp: data.timestamp,
			source: data.source,
			priceUsd: data.priceUsd || 0,
			lastUpdate: data.lastUpdate,
		};
	} catch (error) {
		return {
			success: false,
			ticker,
			symbol: ticker,
			error: error instanceof Error ? error.message : "Failed to fetch price",
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
		const response = await fetch(`${BASE_URL}/trending/stocks/${symbol}`);

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${symbol}`);
		}

		const data = await response.json();

		return {
			success: true,
			symbol,
			price: data.price || 0,
			timestamp: data.timestamp,
			source: data.source,
			priceUsd: data.priceUsd || 0,
			lastUpdate: data.lastUpdate,
		};
	} catch (error) {
		return {
			success: false,
			symbol,
			error: error instanceof Error ? error.message : "Failed to fetch price",
		};
	}
}

export { fetchTokensTrending, fetchFXTrending, fetchStocksTrending, fetchFXPrice, fetchStockPrice };
