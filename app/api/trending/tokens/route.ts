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

export async function GET(req: Request) {
    try {
    // Fetch a specific pool from GeckoTerminal by its pool address (useful for Base chain fallbacks)
    const fetchGeckoPoolByAddress = async (network: string, poolAddress: string): Promise<PoolData | null> => {
            try {
                const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}`;
                const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
                if (!resp.ok) return null;
                const json = await resp.json();
                // Use data and included tokens if available
                const pool = json.data;
                if (!pool) return null;
                const includedBaseToken = json.included?.find((i: any) => i.type === "token" && i.id === pool.relationships?.base_token?.data?.id);
                return { chain: network, data: { attributes: pool.attributes, relationships: pool.relationships, includedBaseToken } };
            } catch (_err) {
                return null;
            }
    };
        
        const url = new URL(req.url);
        const searchParams = url.searchParams;
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
        if ((!results || results.length === 0) && defaultChainPairs[chain] && defaultChainPairs[chain].length > 0) {
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

        // Transform results to a smaller object shape
        let transformedData = results
            .filter((r) => r.data)
            .map((r, idx) => {
                const pair = r.data as any;
                const base = pair.baseToken || r.data?.includedBaseToken?.attributes;
                const tokenSymbol = base?.symbol || "UNKNOWN";
                const tokenAddress = extractTokenAddress(pair as Record<string, unknown>); // may return empty
                const virtualMarket = tokenSymbol ? marketLookupMap.get(tokenSymbol.toUpperCase()) : null;

                return {
                    id: idx + 1,
                    symbol: base?.symbol || tokenSymbol,
                    name: base?.name || base?.symbol || tokenSymbol,
                    priceUsd: pair.priceUsd || pair.attributes?.base_token_price_usd || null,
                    change24h: pair.priceChange?.h24 ?? pair.attributes?.price_change_percentage?.h24 ?? 0,
                    volume24h: pair.volume?.h24 ?? pair.attributes?.volume_usd?.h24 ?? 0,
                    liquidityUsd: pair.liquidity?.usd ?? pair.attributes?.reserve_in_usd ?? 0,
                    trend: (pair.priceChange?.h24 ?? pair.attributes?.price_change_percentage?.h24 ?? 0) >= 0 ? "up" : "down",
                    logo: pair.info?.imageUrl || pair.info?.header || base?.logo || base?.image_url || "",
                    pairAddress: pair.pairAddress || pair.attributes?.address || pair.attributes?.address,
                    tokenAddress: tokenAddress,
                    dexId: pair.dexId || pair.attributes?.dex_id || pair.relationships?.dex?.data?.id,
                    chainId: pair.chainId || r.chain,
                    chain: r.chain,
                    hasMarket: !!virtualMarket,
                    marketId: virtualMarket?.marketId || null,
                };
            });

        // Apply chainFilter (if provided as chain param) - already applied but keep for safety
        const chainFilter = searchParams.get("chain");
        if (chainFilter) transformedData = transformedData.filter((t) => t.chain === chainFilter);

        // Apply hasMarket filter if specified
        if (hasMarketFilter !== null) {
            transformedData = transformedData.filter((t) => (hasMarketFilter ? !!t.hasMarket : !t.hasMarket));
        }

        // Sorting
        if (sortMode === "change") transformedData.sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
        else if (sortMode === "volume") transformedData.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
        else transformedData.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));

        // If total not defined from gecko, compute it from the full transformed list
        total = total ?? transformedData.length;

        // Pagination
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedData = transformedData.slice(start, end);
        const pagination = { page, limit, total, hasMore: end < total };

        return Response.json({ data: pagedData, pagination });
    } catch (_error) {
        return Response.json({ error: "Failed to fetch token data" }, { status: 500 });
    }
}
