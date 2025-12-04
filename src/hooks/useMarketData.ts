import useAsyncFn from "react-use/lib/useAsyncFn";

export interface MarketData {
	priceUsd?: string;
	priceChange?: string;
	marketCap?: string;
	fdv?: string;
	liquidity?: string;
	volume24h?: string;
	volume6h?: string;
	volume1h?: string;
	txns24h?: { buys: number; sells: number };
	txns6h?: { buys: number; sells: number };
	poolCreated?: string;
	pairAddress?: string;
	tokenLogo?: string;
	baseTokenLogo?: string;
	quoteTokenLogo?: string;
	baseTokenSymbol?: string;
	quoteTokenSymbol?: string;
	baseTokenAddress?: string;
	quoteTokenAddress?: string;
}

async function fetchPairFromDexScreener(pairAddress: string, chain: string = "base") {
	try {
		const res = await fetch(`/api/dexscreener/latest/dex/pairs/${chain}/${pairAddress}`);
		if (!res.ok) return null;

		const json = await res.json();
		const pair = json.pair || json.pairs?.[0];
		if (!pair) return null;

		// Normalize returned object
		const response = {
			baseToken: pair.baseToken,
			quoteToken: pair.quoteToken,
			priceUsd: pair.priceUsd,
			priceChange: pair.priceChange,
			marketCap: pair.marketCap,
			fdv: pair.fdv,
			liquidity: pair.liquidity,
			volume: pair.volume,
			txns: pair.txns,
			pairCreatedAt: pair.pairCreatedAt,
			info: pair.info,
		};

		return response;
	} catch {
		return null;
	}
}

export function useMarketData(chain: string, pairAddress: string) {
	const [{ value: marketData, loading, error }, fetchMarketData] = useAsyncFn(async () => {
		if (!pairAddress) {
			return undefined;
		}
		const pair = await fetchPairFromDexScreener(pairAddress, chain);
		if (!pair) {
			return undefined;
		}

		return {
			priceUsd: pair.priceUsd,
			priceChange: pair.priceChange?.h24
				? `${pair.priceChange.h24 >= 0 ? "+" : ""}${pair.priceChange.h24.toFixed(2)}%`
				: undefined,
			marketCap: pair.marketCap?.toString(),
			fdv: pair.fdv?.toString(),
			liquidity: pair.liquidity?.usd?.toString(),
			volume24h: pair.volume?.h24?.toString(),
			volume6h: pair.volume?.h6?.toString(),
			volume1h: pair.volume?.h1?.toString(),
			txns24h: pair.txns?.h24
				? {
						buys: pair.txns.h24.buys || 0,
						sells: pair.txns.h24.sells || 0,
					}
				: undefined,
			txns6h: pair.txns?.h6
				? {
						buys: pair.txns.h6.buys || 0,
						sells: pair.txns.h6.sells || 0,
					}
				: undefined,
			poolCreated: pair.pairCreatedAt
				? new Date(pair.pairCreatedAt).toLocaleDateString()
				: undefined,
			tokenLogo: pair.info?.imageUrl,
			baseTokenLogo: pair.baseToken?.logo,
			quoteTokenLogo: pair.quoteToken?.logo,
			baseTokenSymbol: pair.baseToken?.symbol,
			quoteTokenSymbol: pair.quoteToken?.symbol,
			baseTokenAddress: pair.baseToken?.address,
			quoteTokenAddress: pair.quoteToken?.address,
		} as MarketData;
	}, [chain, pairAddress]);

	return { marketData, loading, error, refetch: fetchMarketData };
}
