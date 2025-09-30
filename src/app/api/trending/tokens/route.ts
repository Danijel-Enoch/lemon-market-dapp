/* eslint-disable @typescript-eslint/no-unused-vars */
const pairs = [
	"0x16969fa79651bae11736f2f6576a86fe2726b42b",
	"0x3817ff61b34c5ff5dc89709b2db1f194299e3ba9",
	"0x3dc2878f9f60476dbbb18af7531fbe1a603c8dc0",
	"0xa1893c58a39c67f1e0f5d5ef6b8d673ef0448968"
];

const poolsDetails = pairs.map(async (pair) => {
	const response = await fetch(
		`https://api.dexscreener.com/latest/dex/pairs/${"bsc"}/${pair}`,
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
		const results = await Promise.all(poolsDetails);

		// Transform the DexScreener data to match our expected format
		const transformedData = results.filter(Boolean).map((pair, index) => ({
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
			// Additional fields for potential future use
			pairAddress: pair.pairAddress,
			liquidity: pair.liquidity?.usd,
			dexId: pair.dexId,
			chainId: pair.chainId
		}));

		return Response.json({ data: transformedData });
	} catch (error) {
		console.error("Error fetching token data:", error);
		return Response.json(
			{ error: "Failed to fetch token data" },
			{ status: 500 }
		);
	}
}
