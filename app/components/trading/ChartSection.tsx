import { useEffect, useMemo, useState } from "react";
import useAsync from "react-use/lib/useAsync";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@app/components/ui/button";
import { fetchChartData } from "@app/lib/chart-data-service";

interface ChartSectionProps {
	pairAddress?: string;
	chain?: string;
	symbol?: string;
	assetType?: "crypto" | "stock" | "forex";
	priceData?: {
		price: string;
		change: string;
		lastUpdate: Date;
	};
	fetchLatestPrice: () => Promise<unknown>;
	isLoadingPrice: boolean;
	marketData?: {
		marketCap?: string;
		fdv?: string;
		liquidity?: string;
		volume24h?: string;
		volume1h?: string;
		txns24h?: { buys: number; sells: number };
		holders?: number;
		poolCreated?: string;
	};
}

const timeframes = [
	{ label: "3 Months", value: "30d" },
	{ label: "7 Days", value: "1h" },
	{ label: "24 Hours", value: "15m" },
] as const;

export function ChartSection({
	pairAddress,
	priceData,
	chain = "base",
	assetType = "crypto",
	symbol,
}: ChartSectionProps) {
	const [selectedTimeframe, setSelectedTimeframe] =
		useState<(typeof timeframes)[number]["value"]>("1h");
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const chartState = useAsync(async () => {
		const result = await fetchChartData(
			pairAddress || "",
			chain,
			selectedTimeframe,
			assetType,
			symbol,
		);
		return result.data;
	}, [pairAddress, chain, selectedTimeframe, refreshTrigger, assetType, symbol]);

	const chartData = useMemo(() => chartState.value || [], [chartState.value]);
	const loading = chartState.loading && isInitialLoad;
	const latestCandle = useMemo(
		() => (chartData.length > 0 ? chartData[chartData.length - 1] : null),
		[chartData],
	);

	// Mark as loaded once we have data
	useEffect(() => {
		if (chartData.length > 0) {
			setIsInitialLoad(false);
		}
	}, [chartData]);

	// Reset initial load when timeframe changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: Need to track timeframe changes
	useEffect(() => {
		setIsInitialLoad(true);
	}, [selectedTimeframe]);

	// Auto-refresh every 30 seconds (same as price refresh)
	useEffect(() => {
		const interval = setInterval(() => {
			setRefreshTrigger((prev) => prev + 1);
		}, 30000);

		return () => clearInterval(interval);
	}, []);

	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleDateString("en-US", {
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
			day: "numeric",
		});
	};

	const formatPrice = (value: number) => {
		if (value >= 1) {
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 2,
			}).format(value);
		}
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			maximumSignificantDigits: 4,
		}).format(value);
	};

	const priceChange = Number(priceData?.change.replace("%", ""));
	const isPositive = priceChange >= 0;

	return (
		<div className="">
			<div className="flex items-center justify-between gap-4 p-4 -mb-2">
				<div className="flex space-x-4">
					{timeframes.map((tf) => (
						<Button
							key={tf.value}
							variant="toolbar"
							size="sm"
							onClick={() => setSelectedTimeframe(tf.value)}
							data-state={selectedTimeframe === tf.value ? "active" : "inactive"}
							className="h-7 text-xs px-3"
						>
							{tf.label}
						</Button>
					))}
				</div>
				<div className="flex items-center">
					{latestCandle && (
						<div className="flex items-center gap-6 px-6 text-xs flex-wrap">
							<div className="flex items-center gap-2">
								<span className="text-gray-500 font-medium">O</span>
								<span className="text-gray-300">{formatPrice(latestCandle.open)}</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-gray-500">H</span>
								<span className="text-green-500">{formatPrice(latestCandle.high)}</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-gray-500 font-medium">L</span>
								<span className="text-red-500">{formatPrice(latestCandle.low)}</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-gray-500 font-medium">C</span>
								<span className="text-gray-300">{formatPrice(latestCandle.close)}</span>
							</div>
							<div
								className={`flex items-center gap-1 ${isPositive ? "text-green-500" : "text-red-500"}`}
							>
								<span>
									{isPositive ? "+" : ""}
									{priceChange.toFixed(2)}%
								</span>
							</div>
						</div>
					)}
				</div>
			</div>

			<div className="relative w-full" style={{ height: "450px" }}>
				{loading ? (
					<div className="h-full flex flex-col gap-3 animate-pulse">
						<div className="flex items-end justify-between h-full gap-1 px-2">
							{Array.from({ length: 50 }, (_, i) => (
								<div
									key={`skeleton-bar-${Math.random()}-${i}`}
									className="bg-gray-800 rounded-t flex-1"
									style={{ height: `${Math.random() * 60 + 40}%` }}
								/>
							))}
						</div>
					</div>
				) : chartData.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<div className="text-gray-500">No chart data available</div>
					</div>
				) : (
					<ResponsiveContainer width="100%" height="100%">
						<ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
							<defs>
								<linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#4DAD31" stopOpacity={0.3} />
									<stop offset="95%" stopColor="#4DAD31" stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" stroke="#1c1e2a" vertical={false} />
							<XAxis
								dataKey="time"
								tickFormatter={formatTime}
								stroke="#666"
								style={{ fontSize: "11px" }}
								minTickGap={50}
							/>
							<YAxis
								yAxisId="price"
								hide={true}
								domain={[
									() => {
										const minLow = Math.min(...chartData.map((d) => d.low));
										return minLow * 0.999;
									},
									() => {
										const maxHigh = Math.max(...chartData.map((d) => d.high));
										return maxHigh * 1.001;
									},
								]}
							/>
							<YAxis yAxisId="background" orientation="right" hide={true} domain={[0, 1]} />
							<Tooltip
								contentStyle={{
									backgroundColor: "var(--card)",
									border: "1px solid var(--border)",
									borderRadius: "var(--radius)",
									fontSize: "12px",
								}}
								labelFormatter={(label) => formatTime(label as number)}
								formatter={(value: number, name: string) => {
									if (name === "close") {
										return [formatPrice(value), "Price"];
									}
									return null;
								}}
							/>
							<Bar yAxisId="background" dataKey={() => 1} fill="url(#colorVolume)" opacity={0.4} />
							<Area
								yAxisId="price"
								type="monotone"
								dataKey="close"
								stroke="#4DAD31"
								strokeWidth={2}
								fill="none"
								dot={false}
							/>
						</ComposedChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
