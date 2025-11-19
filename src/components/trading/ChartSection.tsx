"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsync } from "react-use";
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
import { fetchChartData } from "@/lib/chart-data-service";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface ChartSectionProps {
	pairAddress?: string;
	chain?: string;
	symbol?: string;
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
	{ label: "1 Day", value: "1d" },
	{ label: "4 Hours", value: "4h" },
	{ label: "1 Hour", value: "1h" },
];

export function ChartSection({
	pairAddress,
	fetchLatestPrice,
	isLoadingPrice,
	priceData,
	chain = "base",
}: ChartSectionProps) {
	const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const chartState = useAsync(async () => {
		const result = await fetchChartData(pairAddress || "", chain, selectedTimeframe);
		return result.data;
	}, [pairAddress, chain, selectedTimeframe, refreshTrigger]);

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
		if (selectedTimeframe === "1d") {
			return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		}
		return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
	};

	const formatPrice = (value: number) => {
		if (value >= 1) {
			return value.toFixed(2);
		}
		return value.toFixed(6);
	};

	const priceChange = latestCandle
		? ((latestCandle.close - latestCandle.open) / latestCandle.open) * 100
		: 0;
	const isPositive = priceChange >= 0;

	return (
		<div className="bg-[#0a0a0a] rounded-lg p-4">
			<div className="flex items-center justify-between gap-4 mb-4">
				<div className="flex space-x-4">
					{timeframes.map((tf) => (
						<button
							type="button"
							key={tf.value}
							onClick={() => setSelectedTimeframe(tf.value)}
							className={`text-xs px-3 py-1 rounded transition-colors ${
								selectedTimeframe === tf.value
									? "bg-[#4DAD31] text-white"
									: "text-gray-400 hover:text-white"
							}`}
						>
							{tf.label}
						</button>
					))}
				</div>
				<div>
					<div className="flex items-center space-x-2">
						<div className="text-2xl font-bold text-success">
							{priceData === undefined ? <Skeleton className="h-8 w-24" /> : priceData.price}
						</div>

						<Button
							size="sm"
							variant="ghost"
							onClick={fetchLatestPrice}
							disabled={isLoadingPrice}
							className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
							title="Refresh price"
						>
							<svg
								className={`h-4 w-4 ${isLoadingPrice ? "animate-spin" : ""}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>Refresh Price</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
						</Button>
					</div>
					{priceData && (
						<Badge
							className={`${
								priceData.change.startsWith("+")
									? "bg-primary hover:bg-primary/90"
									: "bg-destructive hover:bg-destructive/90"
							}`}
						>
							{priceData.change}
						</Badge>
					)}
					{priceData?.lastUpdate && (
						<div className="mb-2 text-xs text-gray-500 text-right">
							Last updated: {priceData.lastUpdate.toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{latestCandle && (
				<div className="flex items-center gap-6 mb-4 text-xs flex-wrap">
					<div className="flex items-center gap-2">
						<span className="text-gray-500">O</span>
						<span className="text-gray-300">{formatPrice(latestCandle.open)}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">H</span>
						<span className="text-green-500">{formatPrice(latestCandle.high)}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">L</span>
						<span className="text-red-500">{formatPrice(latestCandle.low)}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">C</span>
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
									backgroundColor: "#1a1a1a",
									border: "1px solid #333",
									borderRadius: "4px",
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
