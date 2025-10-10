/* eslint-disable @typescript-eslint/no-unused-vars */
import {
	createMarketLookupMap,
	type VirtualMarket
} from "@/lib/virtual-markets-service";
import {
	formatLiquidity,
	extractTokenAddress,
	normalizeAddress,
	parseLiquidityWith6Decimals
} from "@/lib/virtual-markets-utils";

const pairs = [
	"0x7f1a5b66ba3bb56c4b68cfc353a5e041c9763a4c",
	"0xfab2f613d2b4c43ae304860f759575359eac0566",
	"0xedc625b74537ee3a10874f53d170e9c17a906b9c",
	"0x9cda3a1ca4814877cfc50f17cb3f428dd553a53bdb5836c6f181ff24574e4320",
	"0xaec085e5a5ce8d96a7bdd3eb3a62445d4f6ce703",
	"0x06d7874037e622d6ef42294cf32eb259806cb1c6"
];

const poolsDetails = pairs.map(async (pair) => {
	const response = await fetch(
		`https://api.dexscreener.com/latest/dex/pairs/${"base"}/${pair}`,
		{
			method: "GET"
		}
	);

	const data = await response.json();
	// Return the first pair from the pairs array, or the pair object directly
	return data.pairs?.[0] || data.pair;
});

export async function GET(req: Request) {
	try {
		// Fetch DexScreener data
		const results = await Promise.all(poolsDetails);

		// Extract token symbols for market lookup
		const tokenSymbols = results
			.filter(Boolean)
			.map((pair) => pair?.baseToken?.symbol)
			.filter(Boolean) as string[];

		// Fetch virtual market data for all tokens using symbols
		const marketLookupMap = await createMarketLookupMap(tokenSymbols);

		// Transform the DexScreener data to match our expected format
		const transformedData = results.filter(Boolean).map((pair, index) => {
			const tokenSymbol = pair?.baseToken?.symbol;
			const tokenAddress = extractTokenAddress(pair);
			const virtualMarket = tokenSymbol
				? marketLookupMap.get(tokenSymbol.toUpperCase())
				: null;

			// Get total liquidity from virtual market, fallback to DEX liquidity if no market exists
			const totalLiquidity = virtualMarket
				? parseLiquidityWith6Decimals(virtualMarket.totalLiquidity)
				: parseLiquidityWith6Decimals(pair.liquidity?.usd || 0);

			// Real liquidity is total open interest from virtual market
			const realLiquidity = virtualMarket
				? parseLiquidityWith6Decimals(virtualMarket.realLiquidity)
				: 0;

			return {
				id: index + 1,
				symbol: pair.baseToken?.symbol || "UNKNOWN",
				name:
					pair.baseToken?.name ||
					pair.baseToken?.symbol ||
					"Unknown Token",
				price: pair.priceUsd
					? `$${parseFloat(pair.priceUsd).toFixed(6)}`
					: "$0.00",
				change24h: pair.priceChange?.h24
					? `${
							pair.priceChange.h24 >= 0 ? "+" : ""
					  }${pair.priceChange.h24.toFixed(2)}%`
					: "0.00%",
				volume: pair.volume?.h24
					? `$${(pair.volume.h24 / 1000000).toFixed(2)}M`
					: "$0.00",
				marketCap: pair.marketCap
					? `$${(pair.marketCap / 1000000).toFixed(2)}M`
					: "N/A",
				trend: pair.priceChange?.h24 >= 0 ? "up" : "down",
				logo: pair.info?.imageUrl || "🪙",
				// Virtual market specific fields
				totalLiquidity: formatLiquidity(totalLiquidity),
				realLiquidity: formatLiquidity(realLiquidity),
				openInterest: formatLiquidity(realLiquidity), // Alias for real liquidity
				hasMarket: !!virtualMarket,
				marketId: virtualMarket?.marketId || null,
				virtualLiquidity: virtualMarket
					? formatLiquidity(
							parseLiquidityWith6Decimals(
								virtualMarket.virtualLiquidity
							)
					  )
					: "$0.00",
				// Additional fields for potential future use
				pairAddress: pair.pairAddress,
				tokenAddress: tokenAddress,
				liquidity: pair.liquidity?.usd,
				dexId: pair.dexId,
				chainId: pair.chainId
			};
		});

		return Response.json({ data: transformedData });
	} catch (error) {
		console.error("Error fetching token data:", error);
		return Response.json(
			{ error: "Failed to fetch token data" },
			{ status: 500 }
		);
	}
}
