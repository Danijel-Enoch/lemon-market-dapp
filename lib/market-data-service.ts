export interface PairResponseShape {
    baseToken?: { address?: string; symbol?: string; name?: string };
    quoteToken?: { address?: string; symbol?: string; name?: string };
    priceUsd?: string;
    priceChange?: { h24?: number };
    marketCap?: string | number;
    fdv?: string | number;
    liquidity?: { usd?: string };
    volume?: { h24?: string; h6?: string; h1?: string };
    txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number } };
    pairCreatedAt?: string;
    info?: { imageUrl?: string };
}

export async function fetchPairFromDexScreener(pairAddress: string, chain: string = 'base') {
    try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pairAddress}`);
        if (!res.ok) return null;

        const json = await res.json();
        const pair = json.pair || json.pairs?.[0];
        if (!pair) return null;

        // Normalize returned object
        const response: PairResponseShape = {
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
    } catch (error) {
        console.error('market-data-service: failed to fetch pair', error);
        return null;
    }
}
