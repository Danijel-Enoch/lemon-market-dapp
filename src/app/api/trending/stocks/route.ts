export const dynamic = "force-dynamic";
export const revalidate = 0;

const TRENDING_ASSETS = [
	{ symbol: "AAPL", type: "Equities" },
	{ symbol: "NVDA", type: "Equities" },
	{ symbol: "META", type: "Equities" },
	{ symbol: "AMZN", type: "Equities" },
	{ symbol: "MSFT", type: "Equities" },
	{ symbol: "GOOG", type: "Equities" },
	{ symbol: "AMAT", type: "Equities" },
	{ symbol: "PEP", type: "Equities" },
	{ symbol: "AMD", type: "Equities" },
	{ symbol: "TMUS", type: "Equities" },
	{ symbol: "DIS", type: "Equities" },
];

async function fetchAssetData(symbol: string, type: string) {
	try {
		const url = `https://api.diadata.org/v1/rwa/${type}/${symbol}`;
		const response = await fetch(url);

		if (!response.ok) {
			return { symbol, type, error: "Failed to fetch data" };
		}

		const data = await response.json();
		return {
			symbol,
			type,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			...data,
		};
	} catch (error) {
		return {
			symbol,
			type,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Fetch price for a specific stock symbol
 * Used by position API for opening/closing positions
 * @param symbol - Stock symbol (e.g., "AAPL")
 * @returns Price data with timestamp
 */
async function fetchStockPrice(symbol: string) {
	try {
		const url = `https://api.diadata.org/v1/rwa/Equities/${symbol}`;
		const response = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${symbol}`);
		}

		const data = await response.json();

		return {
			success: true,
			symbol,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			priceUsd: data.Price, // For position API compatibility
			lastUpdate: new Date(data.Timestamp).toISOString(),
		};
	} catch (error) {
		return {
			success: false,
			symbol,
			error: error instanceof Error ? error.message : "Failed to fetch price",
		};
	}
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const symbol = searchParams.get("symbol");
	const action = searchParams.get("action");

	// Handle price fetch endpoint (used by position API)
	if (action === "price" && symbol) {
		const priceData = await fetchStockPrice(symbol);

		if (!priceData.success) {
			return Response.json(
				{
					error: "Failed to fetch stock price",
					details: priceData.error,
				},
				{ status: 404 },
			);
		}

		return Response.json(priceData);
	}

	// Default: fetch trending stocks
	try {
		const stocksDetails = await Promise.all(
			TRENDING_ASSETS.map((asset) => fetchAssetData(asset.symbol, asset.type)),
		);

		return Response.json({
			data: stocksDetails,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return Response.json(
			{
				error: "Failed to fetch trending stocks",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
