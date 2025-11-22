/* eslint-disable @typescript-eslint/no-unused-vars */
import { createMarketLookupMap } from "@/lib/virtual-markets-service";
import { extractTokenAddress } from "@/lib/virtual-markets-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PoolData {
	chain: string;
	data: any | null;
}

// Fetch a page of pools from GeckoTerminal and return simplified pool objects
const fetchPoolsFromGecko = async (
	network: string,
	page: number,
	perPage: number,
): Promise<{ pools: PoolData[]; total?: number } | null> => {
	try {
		const url = `https://api.geckoterminal.com/api/v2/search/pools?query=&network=${encodeURIComponent(
			network,
		)}&include=base_token,quote_token,dex&page=${page}&per_page=${perPage}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});
		if (!response.ok) {
			return null;
		}

		const data = await response.json();

		// Build a map of included tokens for lookup
		const includedMap = new Map<string, any>();
		(data.included || []).forEach((item: any) => {
			if (item.type === "token") includedMap.set(item.id, item);
		});

		const pools: PoolData[] = (data.data || []).map((pool: any) => ({
			chain: network,
			data: {
				attributes: pool.attributes,
				relationships: pool.relationships,
				includedBaseToken: includedMap.get(pool.relationships?.base_token?.data?.id),
			},
		}));

		return { pools, total: data.meta?.total || undefined };
	} catch (_err) {
		return null;
	}
};

// Fetch a specific pair details from DexScreener for fallback situations
const fetchDexScreenerPair = async (chain: string, pair: string): Promise<PoolData | null> => {
	try {
		let url: string;
		if (chain === "solana") url = `https://api.dexscreener.com/latest/dex/tokens/${pair}`;
		else url = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pair}`;

		const resp = await fetch(url, { method: "GET" });
		if (!resp.ok) return null;
		const json = await resp.json();
		const p = json.pairs?.[0] || json.pair || null;
		return p ? { chain, data: p } : null;
	} catch (_err) {
		return null;
	}
};

// Transform results to a smaller object shape
// Helper: robustly extract base token info (symbol, name, address, logo)
// This is async now because we may call external token endpoints to fill missing fields
const getBaseTokenInfo = async (
	pair: any,
	chain: string,
): Promise<{
	address?: string | null;
	symbol?: string | null;
	name?: string | null;
	logo?: string | null;
}> => {
	// DexScreener style
	if (pair.baseToken) {
		const addr = pair.baseToken.address || null;
		const initialLogo = pair.baseToken.logo || pair.info?.imageUrl || pair.info?.header || null;
		// If we have an address, prefer GeckoTerminal details (logo/name/symbol) when available.
		if (addr && chain) {
			try {
				const tokenResp = await fetch(
					`https://api.geckoterminal.com/api/v2/networks/${chain}/tokens/${addr}`,
					{ method: "GET", headers: { Accept: "application/json" } },
				);
				if (tokenResp.ok) {
					const tokenJson = await tokenResp.json();
					const tok = tokenJson.data?.attributes || tokenJson.data;
					if (tok) {
						return {
							address: addr || null,
							symbol: tok.symbol || pair.baseToken.symbol || null,
							name: tok.name || pair.baseToken.name || null,
							logo: tok.image_url || tok.logo || pair.baseToken.logo || null,
						};
					}
				}
			} catch (_err) {
				// ignore gecko fetch errors; fall back to whatever DexScreener provided
			}
		}
		return {
			address: addr || null,
			symbol: pair.baseToken.symbol || null,
			name: pair.baseToken.name || null,
			logo: initialLogo,
		};
	}

	// GeckoTerminal included token attributes
	if (pair.includedBaseToken?.attributes) {
		const a = pair.includedBaseToken.attributes;
		return {
			address: a.address || null,
			symbol: a.symbol || null,
			name: a.name || null,
			logo: a.image_url || null,
		};
	}

	// GeckoTerminal relationships -> base token id
	if (pair.relationships?.base_token?.data?.id) {
		const id = pair.relationships.base_token.data.id;
		// Sometimes id is the token address; normalize
		// Try to treat id as address and call geckoterminal token endpoint for more info
		try {
			const tokenResp = await fetch(
				`https://api.geckoterminal.com/api/v2/networks/${chain}/tokens/${id}`,
				{ method: "GET", headers: { Accept: "application/json" } },
			);
			if (tokenResp.ok) {
				const tokenJson = await tokenResp.json();
				const tok = tokenJson.data?.attributes || tokenJson.data;
				if (tok) {
					return {
						address: tok.address || id || null,
						symbol: tok.symbol || null,
						name: tok.name || null,
						logo: tok.image_url || tok.logo || null,
					};
				}
			}
		} catch (_err) {
			// ignore
		}
		// If gecko token lookup failed, return address hint
		return { address: id || null, symbol: null, name: null, logo: null };
	}

	// GeckoTerminal attributes fallback - some pools embed name/address in attributes
	if (pair.attributes) {
		const attrs = pair.attributes;
		return {
			address: attrs.base_token_address || attrs.token_address || attrs.address || null,
			symbol: attrs.base_token_symbol || attrs.symbol || null,
			name: attrs.base_token_name || attrs.name || null,
			logo: attrs.base_token_image_url || attrs.image_url || attrs.logo || null,
		};
	}

	return { address: null, symbol: null, name: null, logo: null };
};

// Fetch a specific pool from GeckoTerminal by its pool address (useful for Base chain fallbacks)
const fetchGeckoPoolByAddress = async (
	network: string,
	poolAddress: string,
): Promise<PoolData | null> => {
	try {
		const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}`;
		const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
		if (!resp.ok) return null;
		const json = await resp.json();
		// Use data and included tokens if available
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
	} catch (_err) {
		return null;
	}
};

// Define a default/fallback static list of pairs (used when external APIs don't return trending data)
// These are the original hard-coded pairs the app used prior to dynamic fetching.
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

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const searchParams = url.searchParams;

		const chain = (searchParams.get("chain") || "base").toLowerCase();
		const limitParam = Number(searchParams.get("limit") || searchParams.get("perPage") || 15);
		const pageParam = Number(searchParams.get("page") || 1);
		const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 15), 15);
		const page = Math.max(1, Number.isFinite(pageParam) ? pageParam : 1);
		const sortMode = (searchParams.get("sort") || "liquidity").toLowerCase();
		const hasMarketFilterRaw = searchParams.get("hasMarket");
		const hasMarketFilter = hasMarketFilterRaw === null ? null : hasMarketFilterRaw === "true";

		// Fetch pools from GeckoTerminal first
		const gecko = await fetchPoolsFromGecko(chain, page, limit);
		let results: PoolData[] = [];
		let total: number | undefined = gecko?.total;

		if (gecko && gecko.pools.length > 0) {
			results = gecko.pools;
		} else {
			// fallback to DexScreener search
			try {
				const dsResp = await fetch(`https://api.dexscreener.com/latest/dex/search?q=`, {
					method: "GET",
					headers: { Accept: "*/*" },
				});
				if (dsResp.ok) {
					const dsData = await dsResp.json();
					const flatPairs = dsData.pairs || [];
					results = flatPairs
						.filter((p: any) => p.chainId?.toLowerCase() === chain)
						.map((p: any) => ({ chain, data: p }));
				}
			} catch (_err) {
				// ignore fallback error
			}
		}

		// If still empty, fallback to static pair list and try gecko per-pool fetch (useful for Base)
		if (
			(!results || results.length === 0) &&
			defaultChainPairs[chain] &&
			defaultChainPairs[chain].length > 0
		) {
			const pairs = defaultChainPairs[chain] || [];
			const fetchedPools = await Promise.all(
				pairs.map(async (p) => {
					// Try gecko network pool fetch first (supports base)
					const gp = await fetchGeckoPoolByAddress(chain, p);
					if (gp) return gp;
					// If gecko doesn't work for this chain, try dexscreener per-pair fetch
					return await fetchDexScreenerPair(chain, p);
				}),
			);
			results = fetchedPools.filter((r): r is PoolData => r !== null);
			total = total ?? results.length;
		}

		// Extract token symbols for market lookup
		const tokenSymbols = results
			.filter((r) => r.data)
			.map((r) => r.data?.baseToken?.symbol || r.data?.includedBaseToken?.attributes?.symbol)
			.filter(Boolean) as string[];

		let marketLookupMap = new Map<string, any>();
		if (tokenSymbols.length > 0) {
			try {
				marketLookupMap = await createMarketLookupMap(tokenSymbols);
			} catch (_err) {
				// ignore
			}
		}

		// Map and enrich results asynchronously so we can call token endpoints when needed
		let transformedData = (
			await Promise.all(
				results
					.filter((r) => r.data)
					.map(async (r, idx) => {
						const pair = r.data as any;
						const baseInfo = await getBaseTokenInfo(pair, chain);
						console.log("baseInfo:", { baseInfo, pair: JSON.stringify(r) });
						const tokenSymbol =
							baseInfo.symbol ||
							baseInfo.name ||
							pair.baseToken?.symbol ||
							pair.attributes?.base_token_symbol ||
							pair.attributes?.base_token_name ||
							pair.attributes?.pool_name ||
							`TOKEN-${String(pair.pairAddress || pair.attributes?.address || idx).slice(0, 8)}`;
						// If extractTokenAddress fails, use the included base token address (e.g. gecko)
						const extracted = extractTokenAddress(pair as Record<string, unknown>);
						const tokenAddress =
							extracted ||
							baseInfo.address ||
							pair.relationships?.base_token?.data?.id ||
							pair.baseToken?.address ||
							null;
						const virtualMarket = tokenSymbol
							? marketLookupMap.get(String(tokenSymbol).toUpperCase())
							: null;

						return {
							id: idx + 1,
							symbol: baseInfo.symbol || tokenSymbol,
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
							logo: baseInfo.logo || pair.info?.imageUrl || pair.info?.header || "",
							pairAddress: pair.pairAddress || pair.attributes?.address || pair.attributes?.address,
							tokenAddress: tokenAddress,
							dexId: pair.dexId || pair.attributes?.dex_id || pair.relationships?.dex?.data?.id,
							chainId: pair.chainId || r.chain,
							chain: r.chain,
							hasMarket: !!virtualMarket,
							marketId: virtualMarket?.marketId || null,
						};
					}),
			)
		).filter((i) => i !== undefined) as any[];

		// Apply chainFilter (if provided as chain param) - already applied but keep for safety
		const chainFilter = searchParams.get("chain");
		if (chainFilter) transformedData = transformedData.filter((t) => t.chain === chainFilter);

		// Apply hasMarket filter if specified
		if (hasMarketFilter !== null) {
			transformedData = transformedData.filter((t) =>
				hasMarketFilter ? !!t.hasMarket : !t.hasMarket,
			);
		}

		// Sorting
		if (sortMode === "change")
			transformedData.sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
		else if (sortMode === "volume")
			transformedData.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
		else transformedData.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));

		// If total not defined from gecko, compute it from the full transformed list
		total = total ?? transformedData.length;

		// Pagination
		const start = (page - 1) * limit;
		const end = start + limit;
		const pagedData = transformedData.slice(start, end);
		const pagination = { page, limit, total, hasMore: end < total };

		// Attempt to fill unknown symbols/addresses by doing a per-pool GeckoTerminal or DexScreener lookup
		const needsFixIndices: number[] = [];
		pagedData.forEach((d, i) => {
			if (!d.symbol || d.symbol === "UNKNOWN" || !d.tokenAddress) {
				needsFixIndices.push(i + start);
			}
		});

		if (needsFixIndices.length > 0) {
			await Promise.all(
				needsFixIndices.map(async (idx) => {
					const token = transformedData[idx];
					if (!token || !token.pairAddress) return;
					// Try Gecko per-pool
					const gp = await fetchGeckoPoolByAddress(token.chain || chain, token.pairAddress);
					if (gp?.data) {
						const baseInfo = await getBaseTokenInfo(gp.data, chain);
						token.symbol = baseInfo.symbol || token.symbol;
						token.name = baseInfo.name || token.name;
						token.logo = baseInfo.logo || token.logo;
						token.tokenAddress = token.tokenAddress || baseInfo.address || null;
						token.hasMarket =
							token.hasMarket ||
							!!(baseInfo.symbol && marketLookupMap.get(baseInfo.symbol.toUpperCase()));
						token.marketId =
							token.marketId ||
							(baseInfo.symbol && marketLookupMap.get(baseInfo.symbol.toUpperCase())?.marketId) ||
							token.marketId;
						// Update privacy in pagedData view as well
						const localIndex = idx - start;
						if (localIndex >= 0 && localIndex < pagedData.length) {
							pagedData[localIndex] = token;
						}
					} else if (token.chain && token.chain !== "base") {
						// Fallback to DexScreener pair lookup for other networks
						const dp = await fetchDexScreenerPair(token.chain, token.pairAddress);
						if (dp?.data) {
							const basePair = dp.data;
							const baseToken =
								basePair.baseToken || basePair.base_token || basePair.base_token_address;
							// normalize
							const addr = baseToken?.address || basePair.baseToken?.address || null;
							token.tokenAddress = token.tokenAddress || addr || token.tokenAddress;
							token.symbol = token.symbol || basePair.baseToken?.symbol || token.symbol;
							token.name = token.name || basePair.baseToken?.name || token.name;
							token.logo = token.logo || basePair.baseToken?.logo || token.logo;
							const symbolKey = token.symbol ? String(token.symbol).toUpperCase() : null;
							if (symbolKey) {
								token.hasMarket = token.hasMarket || !!marketLookupMap.get(symbolKey);
								token.marketId =
									token.marketId || marketLookupMap.get(symbolKey)?.marketId || token.marketId;
							}
							const localIndex = idx - start;
							if (localIndex >= 0 && localIndex < pagedData.length) {
								pagedData[localIndex] = token;
							}
						}
					}
				}),
			);
		}

		return Response.json({ data: pagedData, pagination });
	} catch (_error) {
		return Response.json({ error: "Failed to fetch token data" }, { status: 500 });
	}
}
