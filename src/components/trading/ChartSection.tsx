"use client";

import { useEffect, useState } from "react";
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
import { fetchChartData, type OHLCVData } from "@/lib/chart-data-service";

interface ChartSectionProps {
	pairAddress?: string;
	chain?: string;
	symbol?: string;
}

const timeframes = [
	{ label: "1Day", value: "1d" },
	{ label: "4 Hours", value: "4h" },
	{ label: "1Hour", value: "1h" },
	{ label: "15 Mins", value: "15m" },
	{ label: "5 Mins", value: "5m" },
	{ label: "1Min", value: "1m" },
];

export function ChartSection({ pairAddress, chain = "base" }: ChartSectionProps) {
	const [chartData, setChartData] = useState<OHLCVData[]>([]);
	const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
	const [loading, setLoading] = useState(true);
	const [latestCandle, setLatestCandle] = useState<OHLCVData | null>(null);
	const [showMarketCap, setShowMarketCap] = useState(false);

	useEffect(() => {
		async function loadChartData() {
			setLoading(true);
			try {
				const result = await fetchChartData(pairAddress || "", chain, selectedTimeframe);
				setChartData(result.data);

				if (result.data.length > 0) {
					setLatestCandle(result.data[result.data.length - 1]);
				}
			} catch (error) {
				console.error("Error loading chart data:", error);
			} finally {
				setLoading(false);
			}
		}

		loadChartData();

		// Auto-refresh every 30 seconds (same as price refresh)
		const interval = setInterval(() => {
			loadChartData();
		}, 30000);

		return () => clearInterval(interval);
	}, [pairAddress, chain, selectedTimeframe]);
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
			{/* Timeframe Controls */}
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
				<button
					type="button"
					onClick={() => setShowMarketCap(!showMarketCap)}
					className={`text-xs px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
						showMarketCap ? "bg-[#4DAD31] text-white" : "bg-gray-800 text-gray-400 hover:text-white"
					}`}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<title>Market Cap</title>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 6v6l4 2" />
					</svg>
					Market Cap
				</button>
			</div>

			{/* Price Info */}
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
					{latestCandle.marketCap && (
						<div className="flex items-center gap-2">
							<span className="text-gray-500">MCap</span>
							<span className="text-gray-300">
								${(latestCandle.marketCap / 1000000).toFixed(2)}M
							</span>
						</div>
					)}
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

			{/* Chart Container */}
			<div className="relative w-full" style={{ height: "450px" }}>
				{loading ? (
					<div className="h-full flex flex-col gap-3 animate-pulse">
						{/* Skeleton bars */}
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
							<YAxis yAxisId="marketCap" orientation="right" hide={true} />
							<Tooltip
								contentStyle={{
									backgroundColor: "#1a1a1a",
									border: "1px solid #333",
									borderRadius: "4px",
									fontSize: "12px",
								}}
								labelFormatter={(label) => formatTime(label as number)}
								formatter={(value: number, name: string) => {
									if (name === "marketCap") {
										return [`$${(value / 1000000).toFixed(2)}M`, "Market Cap"];
									}
									if (name === "close") {
										return [formatPrice(value), "Price"];
									}
									return [formatPrice(value), name];
								}}
							/>
							{showMarketCap && (
								<Bar
									yAxisId="marketCap"
									dataKey="marketCap"
									fill="url(#colorVolume)"
									opacity={0.4}
								/>
							)}
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
