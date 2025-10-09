"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface TokenPriceChartProps {
	tokenSymbol?: string;
	data?: Array<{ time: string; price: number }>;
}

// Mock data for initial display
const mockData = [
	{ time: "00:00", price: 2450 },
	{ time: "04:00", price: 2520 },
	{ time: "08:00", price: 2480 },
	{ time: "12:00", price: 2610 },
	{ time: "16:00", price: 2580 },
	{ time: "20:00", price: 2650 },
	{ time: "24:00", price: 2700 },
];

export function TokenPriceChart({ tokenSymbol = "ETH", data = mockData }: TokenPriceChartProps) {
	const currentPrice = data[data.length - 1]?.price || 0;
	const startPrice = data[0]?.price || 0;
	const priceChange = currentPrice - startPrice;
	const priceChangePercent =
		startPrice > 0 ? ((priceChange / startPrice) * 100).toFixed(2) : "0.00";
	const isPositive = priceChange >= 0;

	return (
		<Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-lg flex items-center gap-2">
							<TrendingUp className="w-5 h-5 text-green-500" />
							{tokenSymbol} Price
						</CardTitle>
						<div className="flex items-baseline gap-2 mt-2">
							<span className="text-2xl font-bold text-white">
								${currentPrice.toLocaleString()}
							</span>
							<span
								className={`text-sm font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}
							>
								{isPositive ? "+" : ""}
								{priceChangePercent}%
							</span>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<ResponsiveContainer width="100%" height={300}>
					<AreaChart data={data}>
						<defs>
							<linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#a3e635" stopOpacity={0.3} />
								<stop offset="100%" stopColor="#a3e635" stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
						<XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} />
						<YAxis
							stroke="#94a3b8"
							fontSize={12}
							tickLine={false}
							tickFormatter={(value) => `$${value}`}
						/>
						<Tooltip
							contentStyle={{
								backgroundColor: "#1a1a1a",
								border: "1px solid #333333",
								borderRadius: "8px",
								color: "#e8eaed",
							}}
							labelStyle={{ color: "#94a3b8" }}
							formatter={(value: number) => [`$${value.toLocaleString()}`, "Price"]}
						/>
						<Area
							type="monotone"
							dataKey="price"
							stroke="#a3e635"
							strokeWidth={2}
							fill="url(#priceGradient)"
						/>
					</AreaChart>
				</ResponsiveContainer>
				<p className="text-xs text-white/60 mt-4 text-center">
					24-hour price chart • Data updates in real-time
				</p>
			</CardContent>
		</Card>
	);
}
