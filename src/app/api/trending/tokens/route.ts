/* eslint-disable @typescript-eslint/no-unused-vars */
const pairs = [
	"0x16969fa79651bae11736f2f6576a86fe2726b42b",
	"0x3817ff61b34c5ff5dc89709b2db1f194299e3ba9",
	"0x3dc2878f9f60476dbbb18af7531fbe1a603c8dc0",
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
	"0x9eb0bc7a207f77811ee365729d00152622a745b7",
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
	"0xb2505b8a1ab470acfbc12dd255e7fa298a23ab67"
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
