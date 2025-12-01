export interface OHLCVData {
	time: number; // Unix timestamp
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	marketCap?: number;
}

export interface ChartDataResponse {
	data: OHLCVData[];
	symbol: string;
	source: string;
}

/**
 * Fetch pool info including market cap from GeckoTerminal
 */
async function fetchPoolInfo(pairAddress: string, chain: string = "base"): Promise<number | null> {
	try {
		const networkMap: Record<string, string> = {
			base: "base",
			ethereum: "eth",
			bsc: "bsc",
			polygon: "polygon_pos",
			arbitrum: "arbitrum",
			optimism: "optimism",
			avalanche: "avax",
		};

		const network = networkMap[chain] || "base";
		const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			return null;
		}

		const result = await response.json();
		const marketCapUsd = result.data?.attributes?.market_cap_usd;

		return marketCapUsd ? parseFloat(marketCapUsd) : null;
	} catch {
		// console.error("Error fetching pool info:", error);
		return null;
	}
}

/**
 * Fetch historical OHLCV data from GeckoTerminal API
 */
async function fetchFromGeckoTerminal(
	pairAddress: string,
	chain: string = "base",
	timeframe: string = "1h",
): Promise<OHLCVData[]> {
	try {
		// Map chain IDs to GeckoTerminal network identifiers
		const networkMap: Record<string, string> = {
			base: "base",
			ethereum: "eth",
			bsc: "bsc",
			polygon: "polygon_pos",
			arbitrum: "arbitrum",
			optimism: "optimism",
			avalanche: "avax",
		};

		const network = networkMap[chain] || "base";

		// Map timeframes to GeckoTerminal intervals
		const timeframeMap: Record<string, string> = {
			"5m": "minute",
			"15m": "minute",
			"1h": "hour",
			"4h": "hour",
			"6h": "hour",
			"24h": "hour",
			"7d": "day",
			"30d": "day",
		};

		const interval = timeframeMap[timeframe] || "hour";

		const aggregateMap: Record<string, number> = {
			"5m": 5,
			"15m": 15,
			"1h": 1,
			"4h": 4,
			"6h": 1,
			"24h": 4,
			"7d": 1,
			"30d": 1,
		};

		const aggregateInterval = aggregateMap[interval] || 1;

		// Determine how much data to fetch based on timeframe
		const limitMap: Record<string, string> = {
			hour: "168", // 7 days of hourly data
			day: "90", // 90 days of daily data
			minute: "288", // 24 hours of 5-minute data
		};

		const limit = limitMap[interval] || "168";

		const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}/ohlcv/${interval}?limit=${limit}&aggregate=${aggregateInterval}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			// console.error(`GeckoTerminal API error: ${response.status}`);
			return [];
		}

		const result = await response.json();

		if (!result.data?.attributes?.ohlcv_list || result.data.attributes.ohlcv_list.length === 0) {
			return [];
		}

		// Fetch market cap for the pool
		const marketCap = await fetchPoolInfo(pairAddress, chain);

		// GeckoTerminal returns [timestamp, open, high, low, close, volume]
		return result.data.attributes.ohlcv_list.map((candle: number[]) => ({
			time: candle[0] * 1000, // Convert to milliseconds
			open: candle[1],
			high: candle[2],
			low: candle[3],
			close: candle[4],
			volume: candle[5],
			marketCap: marketCap || undefined,
		}));
	} catch {
		// console.error("Error fetching from GeckoTerminal:", error);
		return [];
	}
}

/**
 * Fetch chart data for a trading pair
 */
export async function fetchChartData(
	pairAddress: string,
	chain: string = "base",
	timeframe: string = "1h",
	assetType: "crypto" | "stock" | "forex" = "crypto",
	symbol?: string,
): Promise<ChartDataResponse> {
	try {
		// For non-crypto assets, generate mock chart data
		if (assetType !== "crypto" && symbol) {
			const mockData = generateMockChartData(symbol, timeframe, assetType);
			return {
				data: mockData,
				symbol: symbol,
				source: "mock",
			};
		}

		// Fetch from GeckoTerminal
		if (pairAddress) {
			const geckoData = await fetchFromGeckoTerminal(pairAddress, chain, timeframe);

			if (geckoData.length > 0) {
				// For sub-hour timeframes, aggregate the hourly data
				let processedData = geckoData;
				if (timeframe === "0.25h" || timeframe === "0.5h") {
					processedData = aggregateToTimeframe(geckoData, timeframe);
				} else {
					// Sort data chronologically for all other timeframes (oldest to newest)
					processedData = geckoData.sort((a, b) => a.time - b.time);
				}

				return {
					data: processedData,
					symbol: "Token",
					source: "geckoterminal",
				};
			}
		}

		// No data available
		// console.warn("No chart data available for this pair");
		return {
			data: [],
			symbol: "Token",
			source: "none",
		};
	} catch {
		// console.error("Error fetching chart data:", error);

		// Return empty data on error
		return {
			data: [],
			symbol: "Token",
			source: "error",
		};
	}
}

/**
 * Aggregate data to different timeframes
 */
function aggregateToTimeframe(data: OHLCVData[], targetTimeframe: string): OHLCVData[] {
	const timeframes: Record<string, number> = {
		"0.25h": 900000, // 15 minutes in milliseconds
		"0.5h": 1800000, // 30 minutes in milliseconds
		"1h": 3600000,
		"4h": 14400000,
		"1d": 86400000,
	};

	const intervalMs = timeframes[targetTimeframe];
	if (!intervalMs) return data;

	const grouped = new Map<number, OHLCVData[]>();

	for (const candle of data) {
		const bucket = Math.floor(candle.time / intervalMs) * intervalMs;
		if (!grouped.has(bucket)) {
			grouped.set(bucket, []);
		}
		grouped.get(bucket)?.push(candle);
	}

	return Array.from(grouped.entries())
		.map(([time, candles]) => ({
			time,
			open: candles[0].open,
			high: Math.max(...candles.map((c) => c.high)),
			low: Math.min(...candles.map((c) => c.low)),
			close: candles[candles.length - 1].close,
			volume: candles.reduce((sum, c) => sum + c.volume, 0),
			marketCap: candles[0].marketCap,
		}))
		.sort((a, b) => a.time - b.time);
}

function generateMockChartData(
	symbol: string,
	timeframe: string,
	assetType: "stock" | "forex",
): OHLCVData[] {
	// Generate mock historical data for the last 30 days
	const now = Date.now();
	const data: OHLCVData[] = [];
	const days = 30;
	const intervalMs = timeframe === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	const points = timeframe === "1h" ? days * 24 : days;

	// Base price - for demo, use a reasonable price
	let basePrice = 100;
	if (assetType === "forex") {
		basePrice = symbol.includes("USD") ? 1 : 1.3; // USD pairs around 1, others vary
	} else if (assetType === "stock") {
		basePrice = 50 + Math.random() * 200; // Stocks between 50-250
	}

	for (let i = points; i >= 0; i--) {
		const time = now - i * intervalMs;
		const volatility = assetType === "stock" ? 0.02 : 0.005; // Stocks more volatile
		const change = (Math.random() - 0.5) * volatility;
		const open = basePrice * (1 + change);
		const high = open * (1 + Math.random() * volatility);
		const low = open * (1 - Math.random() * volatility);
		const close = open + (high - low) * (Math.random() - 0.5);
		const volume = Math.random() * 1000000 + 100000;

		data.push({
			time: Math.floor(time / 1000),
			open,
			high,
			low,
			close,
			volume,
		});

		basePrice = close; // Next open is previous close
	}

	return data;
}
