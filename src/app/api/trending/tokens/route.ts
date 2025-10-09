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
	"0x16969fa79651bae11736f2f6576a86fe2726b42b",
	"0xbffec96e8f3b5058b1817c14e4380758fada01ef",
	"0x534d3930edba2c0b90a7973549a0287141c987ef",
	"0x3817ff61b34c5ff5dc89709b2db1f194299e3ba9",
	"0xa1893c58a39c67f1e0f5d5ef6b8d673ef0448968",
	"0xe288d9d664c1fa3f9a06d070d135030bbdd809a8",
	"0xd6b652aecb704b0aebec6317315afb90ba641d57",
	"0xf5fda86bb33e46716dfcd845b2a78dff1e24567a",
	"0x3dc2878f9f60476dbbb18af7531fbe1a603c8dc0",
	"0xfad3b1b70868e16e93e323ea1375e2136a6c829a",
	"0x6d76e7bb743fee795a2f00a317760acf822ee2be",
	"0x397699606a5cdd931eac01738dec0f97d0e5f624",
	"0x30d59a44930b3994c116846efe55fc8fcf608aa8",
	"0x808a3f77c4be4e1ae5dab0f63cca2cbfde281dc5",
	"0x6dafbf0ab4fd72e2a5c0ad5a1ed277d3bf8a8d1f",
	"0xd317b5480faf6ef228c502d9c4d0c04599c5b74b",
	"0x7d6f2c4fb78b44527efec5bd5f39d85b04c1c5a2",
	"0xd26d38408a6ac6faff6fdfa92b5910ced2e5fd31",
	"0xf7d21628d824d4910eb92466e830f8d09e9cccb9",
	"0x78fc96f3543337cd5393533ea66dc8fe42ad054d",
	"0x757651b39d4d13509b60b5784ba0e504a8ef6691",
	"0x0f0cf38f67ed6fb00881cdb815e25441f7f022e0",
	"0x0ecf06daae95a9f860551cfd9ca175cc81ad90ed",
	"0xa9a6a589a24f03153b9915ff9bf3d76ae35e14ab",
	"0xaa29973ec578877553df06fa4f74fb63d88136f8",
	"0xf4216d953fb75f1301fed7d76d8164bd839937a3",
	"0xb2505b8a1ab470acfbc12dd255e7fa298a23ab67",
	"0x3c7e7122f4ddcfc5b5c31b5c735ce2ae3b015856",
	"0xdb25c09d96c165b62f6e6f9d9b17174738d897ba",
	"0x1f7b009acfb88aa5e1be0b26bbb7006fe8bda4c5",
	"0xeb7fe075b7677c98c75e105d4f5ace0e19505567",
	"0x6c95e3ec83f0a40360464a8526615f97d2bdbe5d",
	"0x588d7cf062f4edd7c7c7f2d66fd770e03b1ea735",
	"0xf66f5adad3b8f0bd1f9b413e87b772914d05bf3a",
	"0xd0160672b2ca764b8aff188ad806b4cd6ee29e8a",
	"0xb2505b8a1ab470acfbc12dd255e7fa298a23ab67",
	"0xcf084d9004c2fe328bf7819bdd37f3a5b179c0c6",
	"0xa511dc3d8422ee0e2a2c4ec1ac8b893757f0dc77",
	"0x5092a153895359ec9f77d3a66f95b53dcdf8025e",
	"0x0223c711ea46107df0a325e882bf2f657ec10ba5",
	"0x258b62531e0d6c8d1e2e7ff23904fd851def77ca",
	"0x79733327603b067f6ec6a2f111a16799cfbaf99b",
	"0xc33bacff9141da689875e6381c1932348ab4c5cb",
	"0x01c0612fcf95aa3624269dafc4324a47ad7928fa",
	"0x8e86a6c334ab270084bf8273d5293488f2578207",
	"0x126fadb82cc4ab91e6cd03accaf209fb6d1ffaab",
	"0xff0a8df8c4a0332e28a4c94ebb3f633944b08a94",
	"0x2269d2305830e3c3e7c05c26d46dd3790cd7314d",
	"0xca5e9d88c2ef13052435e8320747832731239f13",
	"0x2b69ae7cd715fec1a22908a04661406c0f95829f",
	"0x87a2cb3ffb71ea9940ba3b602047700eaaf8e24b",
	"0x9d60d308878d56c4aa4f89081421e6720bf3e8b2",
	"0x8fc2cc651c0543d5d45034365cdd83018d51523c",
	"0x0ec12db33551afba853b691b4edf49196ea0e99a",
	"0x468ab8fd260878ebd44b7a28ceab5f052e4833d2",
	"0x7874f0ecd450a5f06acb85543fe1d0d48e1c525f",
	"0xa0c7f9b6e1218344d2c06ca301e11ea3b797a8c7",
	"0x7cb113b487e025b3a69537fca579559433240cb5",
	"0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1",
	"0xa424c24c5cbfc377c3b6ae7355c3f30984664b16",
	"0xa341e8e8ee6bf97fa1d18c2d12f00555dc78207e",
	"0xe1799b52c010ad415325d19af139e20b8aa8aab0",
	"0x5db04ea767d9fa92b9c06d7752226be7bc2e546f",
	"0x5092a153895359ec9f77d3a66f95b53dcdf8025e",
	"0x0223c711ea46107df0a325e882bf2f657ec10ba5",
	"0x9e40a810debd1bb3113fd39d0080b2361c279e50",
	"0x8907f25be4878f68d0a968def4ad4b66d1f06226"
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
