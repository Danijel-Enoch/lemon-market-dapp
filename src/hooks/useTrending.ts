import { useCallback, useEffect } from "react";
import useAsyncFn from "react-use/lib/useAsyncFn";
import fetchWithTimeout from "@/lib/fetch-with-timeout";
import { createMarketLookupMap } from "@/lib/virtual-markets-service";
import { extractTokenAddress } from "@/lib/virtual-markets-utils";

// Module-level cache to persist across requests (30 second TTL)
const TOKEN_CACHE_TTL = 30000;
const POOL_CACHE_TTL = 20000;
interface CachedItem<T> {
	data: T;
	expires: number;
}
const tokenInfoCache = new Map<
	string,
	CachedItem<{
		address: string | null;
		symbol: string | null;
		name: string | null;
		logo: string | null;
	}>
>();
const poolCache = new Map<string, CachedItem<{ pools: any[]; total?: number }>>();

// Fetch logo from CoinGecko if available
const fetchCoinGeckoLogo = async (coingeckoId: string): Promise<string | null> => {
	try {
		const response = await fetchWithTimeout(
			`/api/coingecko/api/v3/coins/${coingeckoId}`,
			{ method: "GET", headers: { Accept: "application/json" } },
			3000,
		);
		if (response.ok) {
			const data = await response.json();
			return data.image?.large || null;
		}
	} catch {
		// Ignore
	}
	return null;
};

// Fetch logo from DexScreener pair API
const fetchDexScreenerPairLogo = async (
	chain: string,
	pairAddress: string,
): Promise<string | null> => {
	try {
		const response = await fetchWithTimeout(
			`/api/dexscreener/latest/dex/pairs/${chain}/${pairAddress}`,
			{ method: "GET", headers: { Accept: "application/json" } },
			3000,
		);
		if (response.ok) {
			const data = await response.json();
			return data.pair?.baseToken?.logoURI || data.pair?.baseToken?.logo || null;
		}
	} catch {
		// Ignore
	}
	return null;
};

interface PoolData {
	chain: string;
	data: any | null;
}

// Fetch pools from GeckoTerminal API with pagination
const fetchPoolsFromGecko = async (
	network: string,
	page: number,
	perPage: number,
): Promise<{ pools: PoolData[]; total?: number } | null> => {
	try {
		// Check cache first
		const cacheKey = `${network}:${page}:${perPage}`;
		const cached = poolCache.get(cacheKey);
		if (cached && cached.expires > Date.now()) {
			return cached.data;
		}

		// Use the network-specific pools endpoint instead of search for better included token data
		const url = `/api/geckoterminal/api/v2/networks/${encodeURIComponent(
			network,
		)}/pools?include=base_token,quote_token,pool_name,dex&page=${page ?? 1}`;

		const response = await fetchWithTimeout(
			url,
			{
				method: "GET",
				headers: { Accept: "application/json" },
			},
			4000,
		);

		if (!response.ok) return null;

		const data = await response.json();

		// Build a map of included tokens for lookup
		const includedMap = new Map<string, any>();
		for (const item of data.included || []) {
			if (item.type === "token") includedMap.set(item.id, item);
		}

		const pools: PoolData[] = (data.data || []).map((pool: any) => ({
			chain: network,
			data: {
				attributes: pool.attributes,
				relationships: pool.relationships,
				includedBaseToken: includedMap.get(pool.relationships?.base_token?.data?.id),
			},
		}));

		const result = { pools: pools.slice(0, perPage), total: data.meta?.total };
		// Cache the result
		poolCache.set(cacheKey, { data: result, expires: Date.now() + POOL_CACHE_TTL });
		return result;
	} catch {
		return null;
	}
};

// Fetch a specific pair from DexScreener
const fetchDexScreenerPair = async (chain: string, pair: string): Promise<PoolData | null> => {
	try {
		const url =
			chain === "solana"
				? `/api/dexscreener/latest/dex/tokens/${pair}`
				: `/api/dexscreener/latest/dex/pairs/${chain}/${pair}`;

		const resp = await fetchWithTimeout(url, { method: "GET" }, 4000);
		if (!resp.ok) return null;

		const json = await resp.json();
		const p = json.pairs?.[0] || json.pair || null;
		return p ? { chain, data: p } : null;
	} catch {
		return null;
	}
};

// Extract base token information from pair data, fetching from API when needed
const getBaseTokenInfo = async (
	pair: any,
	chain: string,
	tokenCache: Map<
		string,
		{ address: string | null; symbol: string | null; name: string | null; logo: string | null }
	>,
): Promise<{
	address: string | null;
	symbol: string | null;
	name: string | null;
	logo: string | null;
}> => {
	// DexScreener format
	if (pair.baseToken) {
		const addr = pair.quoteToken.address || null;

		// Try to fetch enhanced data from GeckoTerminal
		if (addr && chain) {
			try {
				// Check persistent cache first
				const cacheKey = `${chain}:${addr.toLowerCase()}`;
				const persistentCached = tokenInfoCache.get(cacheKey);
				if (persistentCached && persistentCached.expires > Date.now()) {
					return persistentCached.data;
				}

				const tokenResp = await fetchWithTimeout(
					`/api/geckoterminal/api/v2/networks/${chain}/tokens/${addr}`,
					{ method: "GET", headers: { Accept: "application/json" } },
					3500,
				);
				if (tokenResp.ok) {
					const tokenJson = await tokenResp.json();
					const tok = tokenJson.data?.attributes;
					if (tok) {
						const result = {
							address: addr,
							symbol: tok.symbol || pair.baseToken.symbol || null,
							name: tok.name || pair.baseToken.name || null,
							logo:
								tok.image_url ||
								pair.baseToken.logo ||
								pair.info?.imageUrl ||
								pair.info?.header ||
								null,
						};
						// Store in both caches
						const cacheKey = `${chain}:${addr.toLowerCase()}`;
						tokenInfoCache.set(cacheKey, { data: result, expires: Date.now() + TOKEN_CACHE_TTL });
						tokenCache.set(addr.toLowerCase(), result);
						return result;
					}
				}
			} catch {
				// Fall back to DexScreener data
			}
		}

		const res = {
			address: addr,
			symbol: pair.baseToken.symbol || null,
			name: pair.baseToken.name || null,
			logo: pair.baseToken.logo || pair.info?.imageUrl || pair.info?.header || null,
		};

		if (addr) {
			const cacheKey = `${chain}:${addr.toLowerCase()}`;
			tokenInfoCache.set(cacheKey, { data: res, expires: Date.now() + TOKEN_CACHE_TTL });
			tokenCache.set(addr.toLowerCase(), res);
		}
		return res;
	}

	// GeckoTerminal included token format
	if (pair.includedBaseToken?.attributes) {
		const a = pair.includedBaseToken.attributes;
		return {
			address: a.address || null,
			symbol: a.symbol || null,
			name: a.name || null,
			logo: a.image_url || pair.attributes?.base_token_image_url || null,
		};
	}

	// GeckoTerminal relationships format
	if (pair.relationships?.base_token?.data?.id) {
		const compoundId = pair.relationships.base_token.data.id;
		const address = compoundId.includes("_") ? compoundId.split("_")[1] : compoundId;

		try {
			// Check persistent cache
			const cacheKey = `${chain}:${address.toLowerCase()}`;
			const persistentCached = tokenInfoCache.get(cacheKey);
			if (persistentCached && persistentCached.expires > Date.now()) {
				return persistentCached.data;
			}

			const cached = tokenCache.get(address.toLowerCase());
			if (cached) return cached;

			const tokenResp = await fetchWithTimeout(
				`/api/geckoterminal/api/v2/networks/${chain}/tokens/${address}`,
				{ method: "GET", headers: { Accept: "application/json" } },
				3500,
			);

			if (tokenResp.ok) {
				const tokenJson = await tokenResp.json();
				const tok = tokenJson.data?.attributes;
				if (tok) {
					let logo = tok.image_url || null;
					if (!logo && tok.coingecko_coin_id) {
						logo = await fetchCoinGeckoLogo(tok.coingecko_coin_id);
					}
					if (!logo && pair.attributes?.address) {
						logo = await fetchDexScreenerPairLogo(chain, pair.attributes.address);
					}
					const result = {
						address: tok.address || address || null,
						symbol: tok.symbol || null,
						name: tok.name || null,
						logo,
					};
					const cacheKey = `${chain}:${address.toLowerCase()}`;
					tokenInfoCache.set(cacheKey, { data: result, expires: Date.now() + TOKEN_CACHE_TTL });
					tokenCache.set(address.toLowerCase(), result);
					return result;
				}
			}
		} catch {
			// Fall back to minimal data
		}

		const res = { address: address || null, symbol: null, name: null, logo: null };
		if (address) {
			const cacheKey = `${chain}:${address.toLowerCase()}`;
			tokenInfoCache.set(cacheKey, { data: res, expires: Date.now() + TOKEN_CACHE_TTL });
			tokenCache.set(address.toLowerCase(), res);
		}
		return res;
	}

	// GeckoTerminal attributes fallback
	if (pair.attributes) {
		const attrs = pair.attributes;
		return {
			address: attrs.base_token_address || attrs.token_address || attrs.address || null,
			symbol: attrs.base_token_symbol || attrs.symbol || null,
			name: attrs.base_token_name || attrs.name || null,
			logo: attrs.base_token_image_url || attrs.image_url || null,
		};
	}
	return { address: null, symbol: null, name: null, logo: null };
};

// Fetch a specific pool from GeckoTerminal by pool address
const fetchGeckoPoolByAddress = async (
	network: string,
	poolAddress: string,
): Promise<PoolData | null> => {
	try {
		const url = `/api/geckoterminal/api/v2/networks/${network}/pools/${poolAddress}`;
		const resp = await fetchWithTimeout(
			url,
			{ method: "GET", headers: { Accept: "application/json" } },
			4000,
		);
		if (!resp.ok) return null;

		const json = await resp.json();
		const pool = json.data;
		if (!pool) return null;

		const includedBaseToken = json.included?.find(
			(i: any) => i.type === "token" && i.id === pool.relationships?.base_token?.data?.id,
		);

		return {
			chain: network,
			data: {
				attributes: pool.attributes,
				relationships: pool.relationships,
				includedBaseToken,
			},
		};
	} catch {
		return null;
	}
};

// Default pairs for fallback when APIs don't return data
const defaultChainPairs: Record<string, string[]> = {
	base: [
		"0x7f1a5b66ba3bb56c4b68cfc353a5e041c9763a4c",
		"0xfab2f613d2b4c43ae304860f759575359eac0566",
		"0xedc625b74537ee3a10874f53d170e9c17a906b9c",
		"0x9cda3a1ca4814877cfc50f17cb3f428dd553a53bdb5836c6f181ff24574e4320",
		"0xaec085e5a5ce8d96a7bdd3eb3a62445d4f6ce703",
		"0x06d7874037e622d6ef42294cf32eb259806cb1c6",
	],
	ethereum: [
		"0x4acc0598be5dff69635cbbadbc2e30925caa8e9e",
		"0xd681aeeb7a24a14ccd76016495f9f8e72476dd87",
		"0xc4704f13d5e08b27b039d53873e813dd2fad99d9",
		"0x66af30a2a6158fe6c57057800a8efecc32d524ba",
		"0x69c7bd26512f52bf6f76fab834140d13dda673ca",
	],
	bsc: [
		"0x3e1d78a38235d1fab9cfd02d7eb99cd9bcb19f4f",
		"0xf0a949d3d93b833c183a27ee067165b6f2c9625e",
		"0x55d398326f99059ff775485246999027b3197955",
		"0xd6b652aecb704b0aebec6317315afb90ba641d57",
		"0xba20fe9506a904a30ebb8b7c348f4969f5a5ea07",
	],
	solana: [
		"2ggvmk4sxcfyumuwtmre6sxwwtnptryaaxlvmaueauav",
		"avsj8vkxsrgjyaqfovs7menkf8hsdjp3mvdo92ezg5wh",
		"35tqqmeirwebk6fr5qipwastuaavo32vjnuljpxvsxuk",
	],
};

// Helper function to batch process with concurrency limit
async function batchProcess<T, R>(
	items: T[],
	processor: (item: T, index: number) => Promise<R>,
	concurrency: number = 5,
): Promise<R[]> {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const batch = items.slice(i, i + concurrency);
		const batchResults = await Promise.all(
			batch.map((item, batchIndex) => processor(item, i + batchIndex)),
		);
		results.push(...batchResults);
	}
	return results;
}

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
}

export interface StockItem {
	symbol: string;
	type: string;
	price: number;
	timestamp: string;
	source: string;
	error?: string;
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

async function fetchTokensTrending(params: {
	limit: number;
	page: number;
	chain?: string;
	sort?: string;
	hasMarket?: boolean;
}): Promise<TrendingResult> {
	const { limit, page, chain = "base", sort = "liquidity", hasMarket } = params;

	// To build up to limit, we may need to fetch multiple pages
	let allResults: PoolData[] = [];
	let currentPage = page;
	let total: number | undefined;
	let hasMore = true;

	while (allResults.length < limit && hasMore) {
		const perPage = Math.min(30, limit - allResults.length);

		// Fetch pools from GeckoTerminal first
		const gecko = await fetchPoolsFromGecko(chain, currentPage, perPage);
		let pageResults: PoolData[] = [];
		let pageTotal: number | undefined = gecko?.total;

		if (gecko?.pools.length) {
			pageResults = gecko.pools;
		} else {
			// Fallback to DexScreener search
			try {
				const dsResp = await fetchWithTimeout(
					`/api/dexscreener/latest/dex/search?q=`,
					{
						method: "GET",
						headers: { Accept: "*/*" },
					},
					4000,
				);
				if (dsResp.ok) {
					const dsData = await dsResp.json();
					pageResults = (dsData.pairs || [])
						.filter((p: any) => p.chainId?.toLowerCase() === chain)
						.map((p: any) => ({ chain, data: p }));
				}
			} catch {
				// Ignore fallback error
			}
		}

		// If still empty, use default pairs
		if (!pageResults.length && defaultChainPairs[chain]?.length) {
			const fetchedPools = await Promise.all(
				defaultChainPairs[chain].map(async (pairAddress) => {
					const gp = await fetchGeckoPoolByAddress(chain, pairAddress);
					if (gp) return gp;
					return await fetchDexScreenerPair(chain, pairAddress);
				}),
			);
			pageResults = fetchedPools.filter((r): r is PoolData => r !== null);
			pageTotal = pageTotal ?? pageResults.length;
		}

		allResults = allResults.concat(pageResults);
		total = pageTotal ?? total;
		hasMore = pageResults.length === perPage; // Assume has more if we got full page
		currentPage++;
	}

	// Now process allResults as in the original GET

	// Token info cache scoped to this request
	const tokenCache = new Map<
		string,
		{ address: string | null; symbol: string | null; name: string | null; logo: string | null }
	>([]);

	// Extract token symbols for market lookup
	const tokenSymbols = allResults
		.map((r) => r.data?.baseToken?.symbol || r.data?.includedBaseToken?.attributes?.symbol)
		.filter(Boolean) as string[];

	let marketLookupMap = new Map<string, any>();
	if (tokenSymbols.length) {
		try {
			marketLookupMap = await createMarketLookupMap(tokenSymbols);
		} catch {
			// Ignore market lookup errors
		}
	}

	// Transform and enrich results with batched processing
	const filteredResults = allResults.filter((r) => r.data);
	let transformedData: TokenItem[] = (
		await batchProcess(
			filteredResults,
			async (r, idx) => {
				const pair = r.data;
				const baseInfo = await getBaseTokenInfo(pair, chain, tokenCache);

				const tokenSymbol =
					baseInfo.symbol ||
					pair.baseToken?.symbol ||
					pair.attributes?.base_token_symbol ||
					pair.attributes?.pool_name ||
					"";

				const tokenAddress =
					extractTokenAddress(pair as Record<string, unknown>) ||
					baseInfo.address ||
					pair.relationships?.base_token?.data?.id ||
					pair.baseToken?.address ||
					null;

				const virtualMarket = tokenSymbol
					? marketLookupMap.get(String(tokenSymbol).toUpperCase())
					: null;

				return {
					id: idx + 1,
					symbol: (pair?.attributes?.name || baseInfo.symbol || tokenSymbol).replace(
						/\s+[.\d]+%/g,
						"",
					),
					name: baseInfo.name || baseInfo.symbol || tokenSymbol,
					priceUsd: pair.priceUsd || pair.attributes?.base_token_price_usd || null,
					change24h: pair.priceChange?.h24 ?? pair.attributes?.price_change_percentage?.h24 ?? 0,
					volume24h: pair.volume?.h24 ?? pair.attributes?.volume_usd?.h24 ?? 0,
					liquidityUsd: pair.liquidity?.usd ?? pair.attributes?.reserve_in_usd ?? 0,
					trend:
						(pair.priceChange?.h24 ?? pair.attributes?.price_change_percentage?.h24 ?? 0) >= 0
							? "up"
							: "down",
					logo: baseInfo.logo || null,
					pairAddress: pair.pairAddress || pair.attributes?.address,
					tokenAddress,
					dexId: pair.dexId || pair.attributes?.dex_id || pair.relationships?.dex?.data?.id,
					chainId: pair.chainId || r.chain,
					chain: r.chain,
					hasMarket: !!virtualMarket,
					marketId: virtualMarket?.marketId || null,
				};
			},
			3,
		)
	).filter(Boolean) as TokenItem[];

	// Apply hasMarket filter if specified
	if (hasMarket !== undefined) {
		transformedData = transformedData.filter((t) => (hasMarket ? t.hasMarket : !t.hasMarket));
	}

	// Sort results
	if (sort === "change") {
		transformedData.sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
	} else if (sort === "volume") {
		transformedData.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
	} else {
		transformedData.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
	}

	total = total ?? transformedData.length;

	// Since we built up, return all up to limit
	const data = transformedData.slice(0, limit);
	const pagination = { page, limit, total, hasMore: transformedData.length > limit };

	return {
		data,
		pagination,
	};
}

const fxPairs = [
	"AUD-USD",
	"CNY-USD",
	"NGN-USD",
	"USD-CHF",
	"CAD-USD",
	"AUD-USD",
	"JPY-USD",
	"EUR-USD",
	"USD-BRL",
	"GBP-USD",
];

async function fetchFXData(pair: string) {
	try {
		const response = await fetch(`https://api.diadata.org/v1/rwa/Fiat/${pair}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			return { ticker: pair, error: "Failed to fetch data" };
		}

		const data = await response.json();
		return {
			ticker: pair,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			...data,
		};
	} catch (error) {
		return {
			ticker: pair,
			error: error instanceof Error ? error.message : "Unknown error",
		};
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
		const url = `https://api.diadata.org/v1/rwa/Fiat/${ticker}`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${ticker}`);
		}

		const data = await response.json();

		return {
			success: true,
			ticker,
			symbol: ticker,
			price: parseFloat(data.Price) || 0,
			timestamp: data.Timestamp,
			source: data.Source,
			priceUsd: parseFloat(data.Price) || 0, // For position API compatibility
			lastUpdate: new Date(data.Timestamp).toISOString(),
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

async function fetchFXTrending({ limit }: { limit: number }): Promise<TrendingResult> {
	try {
		const fxDetails = await Promise.all(fxPairs.map((pair) => fetchFXData(pair)));

		const data = fxDetails.slice(0, limit);

		return {
			data,
			pagination: {
				page: 1,
				limit,
				total: fxDetails.length,
				hasMore: fxDetails.length > limit,
			},
		};
	} catch (error) {
		throw new Error(
			`Failed to fetch FX data: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

const TRENDING_ASSETS = [
	{ symbol: "AAPL", type: "Equities" },
	{ symbol: "NVDA", type: "Equities" },
	{ symbol: "META", type: "Equities" },
	{ symbol: "AMZN", type: "Equities" },
	{ symbol: "MSFT", type: "Equities" },
	{ symbol: "GOOG", type: "Equities" },
	{ symbol: "AMAT", type: "Equities" },
	{ symbol: "PEP", type: "Equities" },
	{ symbol: "AMD", type: "Equities" },
	{ symbol: "TMUS", type: "Equities" },
	{ symbol: "DIS", type: "Equities" },
];

async function fetchAssetData(symbol: string, type: string) {
	try {
		const url = `https://api.diadata.org/v1/rwa/${type}/${symbol}`;
		const response = await fetch(url);

		if (!response.ok) {
			return { symbol, type, error: "Failed to fetch data" };
		}

		const data = await response.json();
		return {
			symbol,
			type,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			...data,
		};
	} catch (error) {
		return {
			symbol,
			type,
			error: error instanceof Error ? error.message : "Unknown error",
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
		const url = `https://api.diadata.org/v1/rwa/Equities/${symbol}`;
		const response = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${symbol}`);
		}

		const data = await response.json();

		return {
			success: true,
			symbol,
			price: parseFloat(data.Price) || 0,
			timestamp: data.Timestamp,
			source: data.Source,
			priceUsd: parseFloat(data.Price) || 0, // For position API compatibility
			lastUpdate: new Date(data.Timestamp).toISOString(),
		};
	} catch (error) {
		return {
			success: false,
			symbol,
			error: error instanceof Error ? error.message : "Failed to fetch price",
		};
	}
}

async function fetchStocksTrending({ limit }: { limit: number }): Promise<TrendingResult> {
	try {
		const stocksDetails = await Promise.all(
			TRENDING_ASSETS.map((asset) => fetchAssetData(asset.symbol, asset.type)),
		);

		const data = stocksDetails.slice(0, limit);

		return {
			data,
			pagination: {
				page: 1,
				limit,
				total: stocksDetails.length,
				hasMore: stocksDetails.length > limit,
			},
		};
	} catch (error) {
		throw new Error(
			`Failed to fetch stocks data: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

export { fetchTokensTrending, fetchFXTrending, fetchStocksTrending, fetchFXPrice, fetchStockPrice };
