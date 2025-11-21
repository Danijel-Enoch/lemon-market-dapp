/* eslint-disable @typescript-eslint/no-unused-vars */
import { getVirtualMarketById } from "@/lib/virtual-markets-service";
import {
	extractTokenAddress,
	formatLiquidity,
	parseLiquidityWith6Decimals,
} from "@/lib/virtual-markets-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep the list in sync with /api/trending/tokens
const chainPairs: Record<string, string[]> = {
	base: [
		"0x7f1a5b66ba3bb56c4b68cfc353a5e041c9763a4c",
		"0xfab2f613d2b4c43ae304860f759575359eac0566",
		"0xedc625b74537ee3a10874f53d170e9c17a906b9c",
		"0x9cda3a1ca4814877cfc50f17cb3f428dd553a53bdb5836c6f181ff24574e4320",
		"0xaec085e5a5ce8d96a7bdd3eb3a62445d4f6ce703",
		"0x06d7874037e622d6ef42294cf32eb259806cb1c6",
	],
	ethereum: [
		"0x4acc0598be5dff69635cbbadbc2e30925caa8e9e", // UNI
		"0xd681aeeb7a24a14ccd76016495f9f8e72476dd87", // WBTC
		"0xc4704f13d5e08b27b039d53873e813dd2fad99d9", // USDT
		"0x66af30a2a6158fe6c57057800a8efecc32d524ba",
		"0x69c7bd26512f52bf6f76fab834140d13dda673ca",
	],
	bsc: [
		"0x3e1d78a38235d1fab9cfd02d7eb99cd9bcb19f4f", // BTCB
		"0xf0a949d3d93b833c183a27ee067165b6f2c9625e", // WETH
		"0x55d398326f99059ff775485246999027b3197955", // USDT
		"0xd6b652aecb704b0aebec6317315afb90ba641d57",
		"0xba20fe9506a904a30ebb8b7c348f4969f5a5ea07",
	],
	solana: [
		"2ggvmk4sxcfyumuwtmre6sxwwtnptryaaxlvmaueauav", // USDT
		"avsj8vkxsrgjyaqfovs7menkf8hsdjp3mvdo92ezg5wh", // USDC
		"35tqqmeirwebk6fr5qipwastuaavo32vjnuljpxvsxuk", // COPE
	],
};

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

const fetchPoolDetails = async (chain: string, pair: string): Promise<PoolData> => {
	try {
		let url: string;
		if (chain === "solana") {
			url = `https://api.dexscreener.com/latest/dex/tokens/${pair}`;
		} else {
			url = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pair}`;
		}

		const response = await fetch(url, { method: "GET" });
		const data = await response.json();
		const pairData = data.pairs?.[0] || data.pair;

		return {
			chain,
			data: pairData,
		};
	} catch (_error) {
		return {
			chain,
			data: null,
		};
	}
};

export async function GET(_req: Request) {
	try {
		// Fetch details for all configured pairs
		const poolsDetails = Object.entries(chainPairs).flatMap(([chain, pairs]) =>
			pairs.map((pair) => fetchPoolDetails(chain, pair)),
		);

		const results = await Promise.all(poolsDetails);

		// Pick the top token by 24h % change
		let top: PoolData | null = null;
		for (const r of results) {
			if (!r.data) continue;
			const change = typeof r.data.priceChange?.h24 === "number" ? r.data.priceChange.h24 : 0;
			if (!top) {
				top = r;
			} else {
				const topChange = top.data?.priceChange?.h24 ?? 0;
				if ((change ?? 0) > (topChange ?? 0)) {
					top = r;
				}
			}
		}

		if (!top || !top.data) {
			return Response.json({ error: "No trending token found" }, { status: 404 });
		}

		const pair = top.data;
		const tokenSymbol = pair.baseToken?.symbol ?? "UNKNOWN";
		const tokenAddress = extractTokenAddress(pair as Record<string, unknown>);

		// Fetch virtual market only for the top token (more efficient than fetching all markets)
		const virtualMarket = tokenSymbol
			? await getVirtualMarketById(tokenSymbol.toUpperCase())
			: null;
		const totalLiquidity = virtualMarket
			? parseLiquidityWith6Decimals(virtualMarket.totalLiquidity)
			: parseLiquidityWith6Decimals(pair.liquidity?.usd || 0);
		const realLiquidity = virtualMarket
			? parseLiquidityWith6Decimals(virtualMarket.realLiquidity)
			: 0;

		const transformed = {
			symbol: tokenSymbol,
			name: pair.baseToken?.name || tokenSymbol,
			price: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(6)}` : "$0.00",
			change24h: pair.priceChange?.h24
				? `${pair.priceChange.h24 >= 0 ? "+" : ""}${pair.priceChange.h24.toFixed(2)}%`
				: "0.00%",
			volume: pair.volume?.h24 ? `$${(pair.volume.h24 / 1000000).toFixed(2)}M` : "$0.00",
			marketCap: pair.marketCap ? `$${(pair.marketCap / 1000000).toFixed(2)}M` : "N/A",
			trend: (pair.priceChange?.h24 ?? 0) >= 0 ? "up" : "down",
			logo: pair.info?.imageUrl || pair.info?.header || pair.baseToken?.logo || "🪙",
			totalLiquidity: formatLiquidity(totalLiquidity),
			realLiquidity: formatLiquidity(realLiquidity),
			openInterest: formatLiquidity(realLiquidity),
			hasMarket: !!virtualMarket,
			marketId: virtualMarket?.marketId || null,
			virtualLiquidity: virtualMarket
				? formatLiquidity(parseLiquidityWith6Decimals(virtualMarket.virtualLiquidity))
				: "$0.00",
			pairAddress: pair.pairAddress,
			tokenAddress: tokenAddress,
			liquidity: pair.liquidity?.usd,
			dexId: pair.dexId,
			chainId: pair.chainId,
			chain: top.chain,
		};

		return Response.json({ data: transformed });
	} catch (err) {
		return Response.json(
			{
				error: "Failed to fetch top trending token",
				message: err instanceof Error ? err.message : "error",
			},
			{ status: 500 },
		);
	}
}
