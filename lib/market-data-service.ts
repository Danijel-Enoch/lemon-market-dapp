export interface PairResponseShape {
	baseToken?: { address?: string; symbol?: string; name?: string; logo?: string };
	quoteToken?: { address?: string; symbol?: string; name?: string; logo?: string };
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

export async function fetchPairFromDexScreener(pairAddress: string, chain: string = "base") {
	try {
		const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pairAddress}`);
		if (!res.ok) return null;

		const json = await res.json();
		const pair = json.pair || json.pairs?.[0];
		if (!pair) return null;

		// Helper to fetch token logo via GeckoTerminal (if available)
		async function fetchLogoFromGecko(address: string | undefined) {
			if (!address) return null;
			try {
				const resp = await fetch(
					`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(chain)}/tokens/${encodeURIComponent(address)}`,
					{ method: "GET", headers: { Accept: "application/json" } },
				);
				if (!resp.ok) return null;
				const json = await resp.json();
				return json?.data?.attributes?.image_url || null;
			} catch (_err) {
				return null;
			}
		}

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

		// Try to fetch or enrich logos when explicit logos are not present
		try {
			const baseAddr = pair.baseToken?.address || pair.attributes?.base_token_address;
			const quoteAddr = pair.quoteToken?.address || pair.attributes?.quote_token_address;

			const [baseLogo, quoteLogo] = await Promise.all([
				(pair.baseToken?.logo as string | undefined)
					? Promise.resolve(pair.baseToken.logo)
					: fetchLogoFromGecko(baseAddr),
				(pair.quoteToken?.logo as string | undefined)
					? Promise.resolve(pair.quoteToken.logo)
					: fetchLogoFromGecko(quoteAddr),
			]);

			if (baseLogo) response.baseToken = { ...(response.baseToken || {}), logo: baseLogo };
			if (quoteLogo) response.quoteToken = { ...(response.quoteToken || {}), logo: quoteLogo };
		} catch (_err) {
			// ignore enrichment errors
		}

		return response;
	} catch (error) {
		console.error("market-data-service: failed to fetch pair", error);
		return null;
	}
}
