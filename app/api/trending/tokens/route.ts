/* eslint-disable @typescript-eslint/no-unused-vars */
import { createMarketLookupMap } from "@/lib/virtual-markets-service";
import {
	extractTokenAddress,
	formatLiquidity,
	parseLiquidityWith6Decimals,
} from "@/lib/virtual-markets-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Define pairs per chain
// We removed the static pair lists and now default to pulling trending pools from GeckoTerminal
// The endpoint supports pagination and a max page size of 15 by default
const chainPairs: Record<string, string[]> = {};

interface PoolData {
	chain: string;
	data: {
		chainId?: string;
		dexId?: string;
		pairAddress?: string;
		baseToken?: {
			address: string;
			name: string;
			symbol: string;
			logo?: string;
		};
		priceUsd?: string;
		volume?: {
			h24?: number;
		};
		priceChange?: {
			h24?: number;
		};
		liquidity?: {
			usd?: number;
		};
		marketCap?: number;
		info?: {
			imageUrl?: string;
			header?: string;
		};
	} | null;
}

// Function to fetch pool details for a specific chain and pair
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
			if (item.type === "token") {
				includedMap.set(item.id, item);
			}
		});

		const pools: PoolData[] = (data.data || [])
			.filter((pool: any) => !!pool.attributes)
			.map((pool: any) => {
				const baseTokenId = pool.relationships?.base_token?.data?.id;
				const baseToken = includedMap.get(baseTokenId);
				return {
					chain: network,
					data: {
						chainId: pool.attributes?.network || network,
						dexId: pool.attributes?.dex_id || pool.relationships?.dex?.data?.id,
						pairAddress: pool.attributes?.address,
						baseToken: baseToken
							? {
								  address: baseToken.attributes.address,
								  name: baseToken.attributes.name,
								  symbol: baseToken.attributes.symbol,
								  logo: baseToken.attributes.image_url,
							  }
							: undefined,
						priceUsd: pool.attributes?.base_token_price_usd,
						volume: {
							h24: pool.attributes?.volume_usd?.h24
								? Number(pool.attributes.volume_usd.h24)
								: undefined,
						},
						priceChange: {
							h24: pool.attributes?.price_change_percentage?.h24
								? Number(pool.attributes.price_change_percentage.h24)
								: undefined,
						},
						liquidity: {
							usd: pool.attributes?.reserve_in_usd
								? Number(pool.attributes.reserve_in_usd)
								: undefined,
						},
						marketCap: pool.attributes?.market_cap_usd
							? Number(pool.attributes.market_cap_usd)
							: undefined,
						info: {
							imageUrl: baseToken?.attributes?.image_url,
							header: pool.attributes?.name,
						},
					},
				};
			});

		return {
			pools,
			total: data.meta?.total || undefined,
		};
	} catch (_error) {
		return null;
	}
};

// Create pool details requests for all chains
// NOTE: we now perform dynamic fetches per-request instead of using a static list
const poolsDetails = [];

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
		const url = new URL(_req.url);
		const searchParams = url.searchParams;

		const chain = (searchParams.get("chain") || "base").toLowerCase();
		const limitParam = Number(searchParams.get("limit") || searchParams.get("perPage") || 15);
		const pageParam = Number(searchParams.get("page") || 1);
		const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 15), 15);
		const page = Math.max(1, Number.isFinite(pageParam) ? pageParam : 1);

		// Try GeckoTerminal first to fetch pools for the network
		const geckoResult = await fetchPoolsFromGecko(chain, page, limit);
		let results: PoolData[] = [];
		let total = geckoResult?.total;

		if (geckoResult && geckoResult.pools.length > 0) {
			results = geckoResult.pools;
		} else {
			// Fallback: Try DexScreener search endpoint (general search with empty query)
			// This is slower, but provides a fallback if GeckoTerminal isn't responding
			try {
				const dsUrl = `https://api.dexscreener.com/latest/dex/search?q=`;
				const dsResp = await fetch(dsUrl, { method: "GET", headers: { Accept: "*/*" } });
				if (dsResp.ok) {
					const dsData = await dsResp.json();
					const flatPairs = dsData.pairs || [];
					// Filter by chain
					results = flatPairs
						.filter((p: any) => p.chainId?.toLowerCase() === chain)
						.map((p: any) => ({ chain, data: p }));
				}
			} catch (_err) {
				// ignore fallback errors
			}
		}
	const chainFilter = searchParams.get("chain");
		// Extract token symbols for market lookup (used to enrich minimal fields)
		const tokenSymbols = results
			.filter((result) => result.data)
			.map((result) => result.data?.baseToken?.symbol)
			.filter(Boolean) as string[];

		// Enrich minimal market info (hasMarket, marketId) without pulling large fields
		let marketLookupMap = new Map<string, any>();
		if (tokenSymbols.length > 0) {
			try {
				marketLookupMap = await createMarketLookupMap(tokenSymbols);
			} catch (_err) {
				// ignore market lookup errors
			}
		}

		// Reduce payload and map to a smaller, faster-to-serialize object
		const transformedData = results
			.filter((result) => result.data)
			.map((result, index) => {
			.map((result) => result.data?.baseToken?.symbol)
			.filter(Boolean) as string[];

		// Fetch virtual market data for all tokens using symbols
		const marketLookupMap = await createMarketLookupMap(tokenSymbols);

				// Build a much smaller response payload for speed
				const virtualMarket = tokenSymbol ? marketLookupMap.get(tokenSymbol.toUpperCase()) : null;
				return {
					id: index + 1,
					symbol: pair.baseToken?.symbol || "UNKNOWN",
					name: pair.baseToken?.name || pair.baseToken?.symbol || "Unknown Token",
					priceUsd: pair.priceUsd || pair?.price || null,
					change24h: pair.priceChange?.h24 ?? pair.priceChange ?? 0,
					volume24h: pair.volume?.h24 ?? pair.volume ?? 0,
					liquidityUsd: pair.liquidity?.usd ?? pair?.reserve_in_usd ?? 0,
					trend: (pair.priceChange?.h24 ?? 0) >= 0 ? "up" : "down",
					logo: pair.info?.imageUrl || pair.info?.header || pair.baseToken?.logo || "",
					pairAddress: pair.pairAddress || pair.attributes?.address,
					tokenAddress: tokenAddress,
					dexId: pair.dexId || pair.attributes?.dex_id || pair.relationships?.dex?.data?.id,
					chainId: pair.chainId || chain,
					chain: chain,
					hasMarket: !!virtualMarket,
					marketId: virtualMarket?.marketId || null,
				};
						? formatLiquidity(parseLiquidityWith6Decimals(virtualMarket.virtualLiquidity))
						: "$0.00",
					// Additional fields for potential future use
		const hasMore = typeof total === "number" ? page * limit < total : transformedData.length === limit;
		const pagination = { page, limit, total: total ?? transformedData.length, hasMore };
		return Response.json({ data: transformedData, pagination });
					tokenAddress: tokenAddress,
					liquidity: pair.liquidity?.usd,
					dexId: pair.dexId,
					chainId: pair.chainId,
					chain: chain, // Add chain information to response
				};
			})
			.filter((item): item is NonNullable<typeof item> => item !== null);

		// Apply chain filter if provided
		if (chainFilter) {
			transformedData = transformedData.filter((t) => t.chain === chainFilter);
		}

		// Apply hasMarket filter if provided (true/false)
		if (hasMarketFilter !== null) {
			transformedData = transformedData.filter((t) => (hasMarketFilter ? !!t.hasMarket : !t.hasMarket));
		}

		// Pagination
		const total = transformedData.length;
		const start = (page - 1) * limit;
		const end = start + limit;
		const pagedData = transformedData.slice(start, end);

		return Response.json({
			data: pagedData,
			pagination: {
				page,
				limit,
				total,
				hasMore: end < total,
			},
		});
	} catch (_error) {
		return Response.json({ error: "Failed to fetch token data" }, { status: 500 });
	}
}
