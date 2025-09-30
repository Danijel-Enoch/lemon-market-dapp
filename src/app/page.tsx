"use client";

import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

// Types
interface Token {
	id: number;
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	volume: string;
	marketCap: string;
	trend: "up" | "down";
	logo: string;
}

interface ForexPair {
	id: number;
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	volume: string;
	spread: string;
	trend: "up" | "down";
	logo: string;
}

// Mock trending tokens data
const trendingTokens: Token[] = [
	{
		id: 1,
		symbol: "BTC",
		name: "Bitcoin",
		price: "$45,234.56",
		change24h: "+2.34%",
		volume: "$23.4B",
		marketCap: "$887.2B",
		trend: "up",
		logo: "₿"
	},
	{
		id: 2,
		symbol: "ETH",
		name: "Ethereum",
		price: "$2,456.78",
		change24h: "+4.12%",
		volume: "$12.8B",
		marketCap: "$295.6B",
		trend: "up",
		logo: "Ξ"
	},
	{
		id: 3,
		symbol: "SOL",
		name: "Solana",
		price: "$98.45",
		change24h: "-1.23%",
		volume: "$2.1B",
		marketCap: "$42.8B",
		trend: "down",
		logo: "◎"
	},
	{
		id: 4,
		symbol: "AVAX",
		name: "Avalanche",
		price: "$23.67",
		change24h: "+6.78%",
		volume: "$456M",
		marketCap: "$8.9B",
		trend: "up",
		logo: "▲"
	},
	{
		id: 5,
		symbol: "MATIC",
		name: "Polygon",
		price: "$0.85",
		change24h: "+3.45%",
		volume: "$234M",
		marketCap: "$6.2B",
		trend: "up",
		logo: "⬟"
	},
	{
		id: 6,
		symbol: "DOT",
		name: "Polkadot",
		price: "$4.32",
		change24h: "-2.11%",
		volume: "$189M",
		marketCap: "$5.1B",
		trend: "down",
		logo: "●"
	}
];

// Mock trending RWAs data
const trendingRWAs: Token[] = [
	{
		id: 1,
		symbol: "USDC",
		name: "USD Coin",
		price: "$1.00",
		change24h: "+0.01%",
		volume: "$2.8B",
		marketCap: "$35.2B",
		trend: "up",
		logo: "💵"
	},
	{
		id: 2,
		symbol: "WBTC",
		name: "Wrapped Bitcoin",
		price: "$45,189.23",
		change24h: "+2.31%",
		volume: "$125M",
		marketCap: "$7.1B",
		trend: "up",
		logo: "🟠"
	},
	{
		id: 3,
		symbol: "stETH",
		name: "Staked Ethereum",
		price: "$2,445.67",
		change24h: "+4.05%",
		volume: "$89M",
		marketCap: "$23.4B",
		trend: "up",
		logo: "🔷"
	}
];

// Mock trending FX data
const trendingFX: ForexPair[] = [
	{
		id: 1,
		symbol: "EUR/USD",
		name: "Euro/US Dollar",
		price: "1.0875",
		change24h: "+0.23%",
		volume: "$1.2T",
		spread: "0.8 pips",
		trend: "up",
		logo: "💶"
	},
	{
		id: 2,
		symbol: "GBP/USD",
		name: "British Pound/US Dollar",
		price: "1.2634",
		change24h: "-0.15%",
		volume: "$845B",
		spread: "1.2 pips",
		trend: "down",
		logo: "💷"
	},
	{
		id: 3,
		symbol: "USD/JPY",
		name: "US Dollar/Japanese Yen",
		price: "149.85",
		change24h: "+0.45%",
		volume: "$967B",
		spread: "0.9 pips",
		trend: "up",
		logo: "💴"
	}
];

// Mock trending Stocks data
const trendingStocks: Token[] = [
	{
		id: 1,
		symbol: "AAPL",
		name: "Apple Inc.",
		price: "$175.43",
		change24h: "+1.87%",
		volume: "$45.2B",
		marketCap: "$2.8T",
		trend: "up",
		logo: "🍎"
	},
	{
		id: 2,
		symbol: "TSLA",
		name: "Tesla Inc.",
		price: "$248.56",
		change24h: "+3.21%",
		volume: "$23.1B",
		marketCap: "$789B",
		trend: "up",
		logo: "🚗"
	},
	{
		id: 3,
		symbol: "NVDA",
		name: "NVIDIA Corporation",
		price: "$432.18",
		change24h: "+2.67%",
		volume: "$34.8B",
		marketCap: "$1.1T",
		trend: "up",
		logo: "🔥"
	}
];

// Mock trending Blue Chips data
const trendingBlueChips: Token[] = [
	{
		id: 1,
		symbol: "BRK.A",
		name: "Berkshire Hathaway",
		price: "$534,200.00",
		change24h: "+0.85%",
		volume: "$2.1B",
		marketCap: "$785B",
		trend: "up",
		logo: "💎"
	},
	{
		id: 2,
		symbol: "JNJ",
		name: "Johnson & Johnson",
		price: "$158.92",
		change24h: "+0.42%",
		volume: "$8.7B",
		marketCap: "$421B",
		trend: "up",
		logo: "🏥"
	},
	{
		id: 3,
		symbol: "PG",
		name: "Procter & Gamble",
		price: "$152.34",
		change24h: "+0.67%",
		volume: "$6.2B",
		marketCap: "$364B",
		trend: "up",
		logo: "🧴"
	}
];

export default function Home() {
	const [searchQuery, setSearchQuery] = useState("");

	// Filter tokens based on search query
	const filteredTokens = trendingTokens.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredRWAs = trendingRWAs.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredFX = trendingFX.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredStocks = trendingStocks.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredBlueChips = trendingBlueChips.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Reusable table component
	const renderTable = (data: any[], title: string, isForex = false) => (
		<Card className="bg-slate-900 border-slate-800 mb-8">
			<CardHeader>
				<CardTitle className="text-white">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-slate-800">
								<th className="text-left p-4 text-gray-400 font-medium">
									#
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									{isForex ? "Pair" : "Token"}
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									Price
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									24h Change
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									{isForex ? "Volume" : "Volume"}
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									{isForex ? "Spread" : "Market Cap"}
								</th>
								<th className="text-left p-4 text-gray-400 font-medium">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{data.length > 0 ? (
								data.map((item, index) => (
									<tr
										key={item.id}
										className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
									>
										<td className="p-4 text-gray-300">
											{index + 1}
										</td>
										<td className="p-4">
											<div className="flex items-center space-x-3">
												<div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold">
													{item.logo}
												</div>
												<div>
													<div className="text-white font-medium">
														{item.symbol}
													</div>
													<div className="text-gray-400 text-sm">
														{item.name}
													</div>
												</div>
											</div>
										</td>
										<td className="p-4 text-white font-medium">
											{item.price}
										</td>
										<td className="p-4">
											<Badge
												variant={
													item.trend === "up"
														? "default"
														: "destructive"
												}
												className={
													item.trend === "up"
														? "bg-green-600 hover:bg-green-700"
														: "bg-red-600 hover:bg-red-700"
												}
											>
												{item.change24h}
											</Badge>
										</td>
										<td className="p-4 text-gray-300">
											{item.volume}
										</td>
										<td className="p-4 text-gray-300">
											{isForex
												? (item as ForexPair).spread
												: (item as Token).marketCap}
										</td>
										<td className="p-4">
											<button className="px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 transition-colors">
												Trade
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="p-8 text-center">
										<div className="text-gray-400">
											<div className="text-lg mb-2">
												No items found
											</div>
											<div className="text-sm">
												Try adjusting your search terms
											</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);

	return (
		<div className="min-h-screen bg-gray-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Trending Assets
					</h1>
					<p className="text-gray-400">
						Discover the most popular assets and their market
						performance across different categories
					</p>
				</div>

				{/* Search Bar */}
				<div className="mb-8">
					<div className="relative max-w-md">
						<Input
							type="text"
							placeholder="Search assets by name or symbol..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-gray-400 focus:border-teal-500"
						/>
						<div className="absolute left-3 top-1/2 transform -translate-y-1/2">
							<svg
								className="w-4 h-4 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</div>
					</div>
					{searchQuery && (
						<p className="text-gray-400 text-sm mt-2">
							Searching across all asset categories for "
							{searchQuery}"
						</p>
					)}
				</div>

				{/* Market Overview */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Total Market Cap
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								$1.24T
							</div>
							<div className="text-sm text-green-400">
								+2.45% (24h)
							</div>
						</CardContent>
					</Card>
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								24h Volume
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								$45.6B
							</div>
							<div className="text-sm text-green-400">
								+8.12% (24h)
							</div>
						</CardContent>
					</Card>
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Active Assets
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								8,542
							</div>
							<div className="text-sm text-gray-400">
								Tracked assets
							</div>
						</CardContent>
					</Card>
				</div>

				{/* All Trading Panels */}
				{renderTable(filteredTokens, "Top Trending Tokens")}
				{renderTable(filteredRWAs, "Trending RWAs")}
				{renderTable(filteredFX, "Trending FX", true)}
				{renderTable(filteredStocks, "Trending Stocks")}
				{renderTable(filteredBlueChips, "Trending Blue Chips")}
			</main>
		</div>
	);
}
