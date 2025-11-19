/**
 * Chart Data Service
 * Fetches OHLCV data from multiple sources for charting
 */

export interface OHLCVData {
	time: number; // Unix timestamp
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface ChartDataResponse {
	data: OHLCVData[];
	symbol: string;
	source: string;
}

/**
 * Fetch historical data from Uniswap V3 subgraph on Base
 */
async function fetchFromBaseSubgraph(
	pairAddress: string,
	timeframe: string = "1h",
): Promise<OHLCVData[]> {
	try {
		const now = Math.floor(Date.now() / 1000);
		const periods = {
			"1m": 60,
			"5m": 300,
			"15m": 900,
			"1h": 3600,
			"4h": 14400,
			"1d": 86400,
		};

		const periodSeconds = periods[timeframe as keyof typeof periods] || 3600;
		const startTime = now - periodSeconds * 100; // Get last 100 periods

		// Uniswap V3 Base subgraph
		const query = `
			{
				poolHourDatas(
					first: 100
					orderBy: periodStartUnix
					orderDirection: desc
					where: {
						pool: "${pairAddress.toLowerCase()}"
						periodStartUnix_gte: ${startTime}
					}
				) {
					periodStartUnix
					open
					high
					low
					close
					volumeUSD
				}
			}
		`;

		const response = await fetch(
			"https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
			},
		);

		if (!response.ok) {
			throw new Error(`Subgraph error: ${response.status}`);
		}

		const result = await response.json();

		if (result.errors) {
			throw new Error(result.errors[0]?.message || "Subgraph query failed");
		}

		if (!result.data?.poolHourDatas || result.data.poolHourDatas.length === 0) {
			return [];
		}

		return result.data.poolHourDatas.map(
			(item: {
				periodStartUnix: number;
				open: string;
				high: string;
				low: string;
				close: string;
				volumeUSD: string;
			}) => ({
				time: item.periodStartUnix * 1000,
				open: parseFloat(item.open),
				high: parseFloat(item.high),
				low: parseFloat(item.low),
				close: parseFloat(item.close),
				volume: parseFloat(item.volumeUSD),
			}),
		);
	} catch (error) {
		console.error("Error fetching from Base subgraph:", error);
		return [];
	}
}

/**
 * Generate mock OHLCV data based on current price
 * Used when real historical data is unavailable
 */
function generateMockOHLCV(currentPrice: number, periods: number = 100): OHLCVData[] {
	const data: OHLCVData[] = [];
	const now = Date.now();
	const hourInMs = 3600000;

	let price = currentPrice * 0.95; // Start at 95% of current price

	for (let i = periods; i >= 0; i--) {
		const time = now - i * hourInMs;
		const volatility = 0.02; // 2% volatility
		const change = (Math.random() - 0.5) * volatility * price;

		const open = price;
		const close = price + change;
		const high = Math.max(open, close) * (1 + Math.random() * 0.01);
		const low = Math.min(open, close) * (1 - Math.random() * 0.01);
		const volume = Math.random() * 1000000;

		data.push({
			time,
			open: Number(open.toFixed(6)),
			high: Number(high.toFixed(6)),
			low: Number(low.toFixed(6)),
			close: Number(close.toFixed(6)),
			volume: Number(volume.toFixed(2)),
		});

		price = close;
	}

	return data;
}

/**
 * Fetch chart data for a trading pair
 */
export async function fetchChartData(
	pairAddress: string,
	chain: string = "base",
	timeframe: string = "1h",
	currentPrice?: number,
): Promise<ChartDataResponse> {
	try {
		// Try to fetch from subgraph first
		if (chain === "base" && pairAddress) {
			const subgraphData = await fetchFromBaseSubgraph(pairAddress, timeframe);

			if (subgraphData.length > 0) {
				return {
					data: subgraphData.reverse(), // Oldest to newest
					symbol: "Token",
					source: "uniswap-v3-base",
				};
			}
		}

		// Fallback to mock data if we have a current price
		if (currentPrice && currentPrice > 0) {
			return {
				data: generateMockOHLCV(currentPrice),
				symbol: "Token",
				source: "mock",
			};
		}

		// Last resort: generate data with a default price
		return {
			data: generateMockOHLCV(1.0),
			symbol: "Token",
			source: "mock",
		};
	} catch (error) {
		console.error("Error fetching chart data:", error);

		// Return mock data as fallback
		return {
			data: generateMockOHLCV(currentPrice || 1.0),
			symbol: "Token",
			source: "mock",
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
