export const dynamic = "force-dynamic";
export const revalidate = 0;

const fxPairs = [
	"AUD-USD",
	"CNY-USD",
	"NGN-USD",
	"USD-CHF",
	"CAD-USD",
	"AUD-USD",
	"JPY-USD",
	"EUR-USD",
	"USD-BRL",
	"GBP-USD",
];

async function fetchFXData(pair: string) {
	try {
		const response = await fetch(`https://api.diadata.org/v1/rwa/Fiat/${pair}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			return { ticker: pair, error: "Failed to fetch data" };
		}

		const data = await response.json();
		return {
			ticker: pair,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			...data,
		};
	} catch (error) {
		return {
			ticker: pair,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Fetch price for a specific FX pair
 * Used by position API for opening/closing positions
 * @param ticker - FX pair ticker (e.g., "AUD-USD")
 * @returns Price data with timestamp
 */
async function fetchFXPrice(ticker: string) {
	try {
		const url = `https://api.diadata.org/v1/rwa/Fiat/${ticker}`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch price for ${ticker}`);
		}

		const data = await response.json();

		return {
			success: true,
			ticker,
			symbol: ticker,
			price: data.Price,
			timestamp: data.Timestamp,
			source: data.Source,
			priceUsd: data.Price, // For position API compatibility
			lastUpdate: new Date(data.Timestamp).toISOString(),
		};
	} catch (error) {
		return {
			success: false,
			ticker,
			symbol: ticker,
			error: error instanceof Error ? error.message : "Failed to fetch price",
		};
	}
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const ticker = searchParams.get("ticker") || searchParams.get("symbol");
	const action = searchParams.get("action");

	// Handle price fetch endpoint (used by position API)
	if (action === "price" && ticker) {
		const priceData = await fetchFXPrice(ticker);

		if (!priceData.success) {
			return Response.json(
				{
					error: "Failed to fetch FX price",
					details: priceData.error,
				},
				{ status: 404 },
			);
		}

		return Response.json(priceData);
	}

	// Default: fetch trending FX pairs
	try {
		const fxDetails = await Promise.all(fxPairs.map((pair) => fetchFXData(pair)));

		return Response.json({
			data: fxDetails,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return Response.json(
			{
				error: "Failed to fetch trending FX pairs",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
