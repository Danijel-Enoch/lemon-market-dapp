/**
 * Chart Data Service
 * Fetches OHLCV data from GeckoTerminal API for charting
 */

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
 * Fetch historical OHLCV data from GeckoTerminal API
 */
async function fetchFromGeckoTerminal(
	pairAddress: string,
	chain: string = "base",
	timeframe: string = "hour",
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
			"1m": "minute",
			"5m": "minute",
			"15m": "minute",
			"1h": "hour",
			"4h": "hour",
			"1d": "day",
		};

		const interval = timeframeMap[timeframe] || "hour";

		// Determine how much data to fetch based on timeframe
		const limitMap: Record<string, string> = {
			minute: "1440", // 24 hours of minute data
			hour: "168", // 7 days of hourly data
			day: "90", // 90 days of daily data
		};

		const limit = limitMap[interval] || "168";

		const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}/ohlcv/${interval}?limit=${limit}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			console.error(`GeckoTerminal API error: ${response.status}`);
			return [];
		}

		const result = await response.json();

		if (!result.data?.attributes?.ohlcv_list || result.data.attributes.ohlcv_list.length === 0) {
			console.log("No OHLCV data available from GeckoTerminal");
			return [];
		}

		// GeckoTerminal returns [timestamp, open, high, low, close, volume]
		return result.data.attributes.ohlcv_list.map((candle: number[]) => ({
			time: candle[0] * 1000, // Convert to milliseconds
			open: candle[1],
			high: candle[2],
			low: candle[3],
			close: candle[4],
			volume: candle[5],
		}));
	} catch (error) {
		console.error("Error fetching from GeckoTerminal:", error);
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
): Promise<ChartDataResponse> {
	try {
		// Fetch from GeckoTerminal
		if (pairAddress) {
			const geckoData = await fetchFromGeckoTerminal(pairAddress, chain, timeframe);

			if (geckoData.length > 0) {
				return {
					data: geckoData,
					symbol: "Token",
					source: "geckoterminal",
				};
			}
		}

		// No data available
		console.warn("No chart data available for this pair");
		return {
			data: [],
			symbol: "Token",
			source: "none",
		};
	} catch (error) {
		console.error("Error fetching chart data:", error);

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
export function aggregateToTimeframe(data: OHLCVData[], targetTimeframe: string): OHLCVData[] {
	const timeframes: Record<string, number> = {
		"1m": 60000,
		"5m": 300000,
		"15m": 900000,
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
		}))
		.sort((a, b) => a.time - b.time);
}
