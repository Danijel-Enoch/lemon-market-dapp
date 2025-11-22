import { createMarketLookupMap } from "@/lib/virtual-markets-service";
import { extractTokenAddress } from "@/lib/virtual-markets-utils";
import fetchWithTimeout from "@/lib/fetch-with-timeout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PoolData {
	chain: string;
	data: any | null;
}

// Module-level cache to persist across requests (30 second TTL)
const TOKEN_CACHE_TTL = 30000;
const POOL_CACHE_TTL = 20000;
interface CachedItem<T> { data: T; expires: number; }
const tokenInfoCache = new Map<string, CachedItem<{ address: string | null; symbol: string | null; name: string | null; logo: string | null; }>>();
const poolCache = new Map<string, CachedItem<{ pools: PoolData[]; total?: number; }>>();

// Cleanup expired cache entries periodically (every 5 minutes)
setInterval(() => {
	const now = Date.now();
	// Clean token cache
	for (const [key, value] of tokenInfoCache.entries()) {
		if (value.expires < now) {
			tokenInfoCache.delete(key);
		}
	}
	// Clean pool cache
	for (const [key, value] of poolCache.entries()) {
		if (value.expires < now) {
			poolCache.delete(key);
		}
	}
}, 300000);

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
		const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(
			network,
		)}/pools?include=base_token,quote_token,pool_name,dex&page=${page}`;

		const response = await fetchWithTimeout(url, {
			method: "GET",
			headers: { Accept: "application/json" },
		}, 4000);

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
				? `https://api.dexscreener.com/latest/dex/tokens/${pair}`
				: `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pair}`;

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
	tokenCache: Map<string, { address: string | null; symbol: string | null; name: string | null; logo: string | null }>,
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

				// Check request cache
				const cached = tokenCache.get(addr.toLowerCase());
				if (cached) return cached;

					const tokenResp = await fetchWithTimeout(
					`https://api.geckoterminal.com/api/v2/networks/${chain}/tokens/${addr}`,
					{ method: "GET", headers: { Accept: "application/json" } },
				3500,
				);				if (tokenResp.ok) {
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
			logo: a.image_url || null,
		};
	}

	// GeckoTerminal relationships format
	if (pair.relationships?.base_token?.data?.id) {
		const id = pair.relationships.quote_token.data.id;

		try {
			// Check persistent cache
			const cacheKey = `${chain}:${String(id).toLowerCase()}`;
			const persistentCached = tokenInfoCache.get(cacheKey);
			if (persistentCached && persistentCached.expires > Date.now()) {
				return persistentCached.data;
			}

			const cached = tokenCache.get(pair.includedBaseToken?.attributes?.address?.toLowerCase?.());
			if (cached) return cached;

			const tokenResp = await fetchWithTimeout(
				`https://api.geckoterminal.com/api/v2/networks/${chain}/tokens/${id}`,
				{ method: "GET", headers: { Accept: "application/json" } },
			3500,
			);

			if (tokenResp.ok) {
				const tokenJson = await tokenResp.json();
				const tok = tokenJson.data?.attributes;
					if (tok) {
					const result = {
						address: tok.address || id || null,
						symbol: tok.symbol || null,
						name: tok.name || null,
						logo: tok.image_url || null,
					};
					const cacheKey = `${chain}:${String(id).toLowerCase()}`;
					tokenInfoCache.set(cacheKey, { data: result, expires: Date.now() + TOKEN_CACHE_TTL });
					tokenCache.set(String(id).toLowerCase(), result);
					return result;
				}
			}
		} catch {
			// Fall back to minimal data
		}

		const res = { address: id || null, symbol: null, name: null, logo: null };
		if (id) {
			const cacheKey = `${chain}:${String(id).toLowerCase()}`;
			tokenInfoCache.set(cacheKey, { data: res, expires: Date.now() + TOKEN_CACHE_TTL });
			tokenCache.set(String(id).toLowerCase(), res);
		}
		return res;
	}

	// GeckoTerminal attributes fallback
	if (pair.attributes) {
		const attrs = pair.attributes;
		console.log("GeckoTerminal attributes fallback:", {
			base_token_address: attrs.base_token_address,
			base_token_symbol: attrs.base_token_symbol,
			base_token_image_url: attrs.base_token_image_url,
			image_url: attrs.image_url,
		});
		return {
			address: attrs.base_token_address || attrs.token_address || attrs.address || null,
			symbol: attrs.base_token_symbol || attrs.symbol || null,
			name: attrs.base_token_name || attrs.name || null,
			logo: attrs.base_token_image_url || attrs.image_url || null,
		};
	}

	console.log("No matching format found for pair:", Object.keys(pair));
	return { address: null, symbol: null, name: null, logo: null };
};

// Fetch a specific pool from GeckoTerminal by pool address
const fetchGeckoPoolByAddress = async (
	network: string,
	poolAddress: string,
): Promise<PoolData | null> => {
	try {
		const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}`;
		const resp = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json" } }, 4000);
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
			batch.map((item, batchIndex) => processor(item, i + batchIndex))
		);
		results.push(...batchResults);
	}
	return results;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const searchParams = url.searchParams;

		const chain = (searchParams.get("chain") || "base").toLowerCase();
		const limitParam = Number(searchParams.get("limit") || searchParams.get("perPage") || 30);
		const pageParam = Number(searchParams.get("page") || 1);
		const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 30), 30);
		const page = Math.max(1, Number.isFinite(pageParam) ? pageParam : 1);
		const sortMode = (searchParams.get("sort") || "liquidity").toLowerCase();
		const hasMarketFilterRaw = searchParams.get("hasMarket");
		const hasMarketFilter = hasMarketFilterRaw === null ? null : hasMarketFilterRaw === "true";

		// Fetch pools from GeckoTerminal first
		const gecko = await fetchPoolsFromGecko(chain, page, limit);
		let results: PoolData[] = [];
		let total: number | undefined = gecko?.total;

		if (gecko?.pools.length) {
			results = gecko.pools;
		} else {
			// Fallback to DexScreener search
			try {
			const dsResp = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/search?q=`, {
				method: "GET",
				headers: { Accept: "*/*" },
			}, 4000);
				if (dsResp.ok) {
					const dsData = await dsResp.json();
					results = (dsData.pairs || [])
						.filter((p: any) => p.chainId?.toLowerCase() === chain)
						.map((p: any) => ({ chain, data: p }));
				}
			} catch {
				// Ignore fallback error
			}
		}

		// If still empty, use default pairs
		if (!results.length && defaultChainPairs[chain]?.length) {
			const fetchedPools = await Promise.all(
				defaultChainPairs[chain].map(async (pairAddress) => {
					const gp = await fetchGeckoPoolByAddress(chain, pairAddress);
					if (gp) return gp;
					return await fetchDexScreenerPair(chain, pairAddress);
				}),
			);
			results = fetchedPools.filter((r): r is PoolData => r !== null);
			total = total ?? results.length;
		}

		// Token info cache scoped to this GET request (avoid repeated network calls for duplicate tokens)
		const tokenCache = new Map<string, {address: string|null; symbol: string|null; name: string|null; logo: string|null;}>(
			[],
		);

		// Extract token symbols for market lookup
		const tokenSymbols = results
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

		// Transform and enrich results with batched processing to limit concurrent API calls
		const filteredResults = results.filter((r) => r.data);
		let transformedData = (
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
						change24h:
							pair.priceChange?.h24 ?? pair.attributes?.price_change_percentage?.h24 ?? 0,
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
				8, // Process 8 items at a time to balance speed vs API rate limits
			)
		).filter(Boolean);

		// Apply hasMarket filter if specified
		if (hasMarketFilter !== null) {
			transformedData = transformedData.filter((t) =>
				hasMarketFilter ? t.hasMarket : !t.hasMarket,
			);
		}

		// Sort results
		if (sortMode === "change") {
			transformedData.sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
		} else if (sortMode === "volume") {
			transformedData.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
		} else {
			transformedData.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
		}

		total = total ?? transformedData.length;

		// Paginate results
		const start = (page - 1) * limit;
		const end = start + limit;
		const pagedData = transformedData.slice(start, end);
		const pagination = { page, limit, total, hasMore: end < total };

		return Response.json({ data: pagedData, pagination });
	} catch {
		return Response.json({ error: "Failed to fetch token data" }, { status: 500 });
	}
}
