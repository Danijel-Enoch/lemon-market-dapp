"use client";

import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

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

// API Response Types
interface APIStockData {
	Ticker: string;
	Price: number;
	Timestamp: string;
}

interface APIResponse {
	data: APIStockData[];
}

interface TokenAPIResponse {
	data: Token[];
}

export default function Home() {
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [apiData, setApiData] = useState({
		stocks: [] as Token[],
		fx: [] as ForexPair[],
		tokens: [] as Token[]
	});

	// Fetch data from APIs
	useEffect(() => {
		const fetchTrendingData = async () => {
			try {
				setIsLoading(true);

				// Fetch tokens data
				const tokensResponse = await fetch("/api/trending/tokens");
				if (!tokensResponse.ok) {
					throw new Error(
						`Tokens API failed: ${tokensResponse.status}`
					);
				}
				const tokensData: TokenAPIResponse =
					await tokensResponse.json();
				console.log("Tokens data:", tokensData);

				// Fetch stocks data
				const stocksResponse = await fetch("/api/trending/stocks");
				if (!stocksResponse.ok) {
					throw new Error(
						`Stocks API failed: ${stocksResponse.status}`
					);
				}
				const stocksData: APIResponse = await stocksResponse.json();
				console.log("Stocks data:", stocksData);

				// Fetch FX data
				const fxResponse = await fetch("/api/trending/fx");
				if (!fxResponse.ok) {
					throw new Error(`FX API failed: ${fxResponse.status}`);
				}
				const fxData: APIResponse = await fxResponse.json();
				console.log("FX data:", fxData);

				// Transform API data to match our interface
				const transformedStocks: Token[] = stocksData.data.map(
					(stock, index) => {
						return {
							id: index + 1,
							symbol: stock.Ticker,
							name:
								stock.Ticker === "NFLX"
									? "Netflix Inc."
									: stock.Ticker === "TSLA"
									? "Tesla Inc."
									: stock.Ticker,
							price: `$${stock.Price.toFixed(2)}`,
							change24h: "N/A", // Not provided by current API
							volume: "N/A", // Not provided by current API
							marketCap: "N/A", // Not provided by current API
							trend: "up", // Default since we don't have change data
							logo:
								stock.Ticker === "NFLX"
									? "🎬"
									: stock.Ticker === "TSLA"
									? "🚗"
									: "📈"
						};
					}
				);

				const transformedFX: ForexPair[] = fxData.data.map(
					(fx, index) => {
						// Map the ticker to a more readable format for FX pairs
						const getDisplaySymbol = (ticker: string) => {
							if (ticker.includes("AUD-USD")) return "AUD/USD";
							if (ticker.includes("CNY-USD")) return "CNY/USD";
							if (ticker.includes("NGN-USD")) return "NGN/USD";
							return ticker;
						};

						const getDisplayName = (ticker: string) => {
							if (ticker.includes("AUD"))
								return "Australian Dollar/US Dollar";
							if (ticker.includes("CNY"))
								return "Chinese Yuan/US Dollar";
							if (ticker.includes("NGN"))
								return "Nigerian Naira/US Dollar";
							return ticker;
						};

						const getLogo = (ticker: string) => {
							if (ticker.includes("AUD")) return "🇦🇺";
							if (ticker.includes("CNY")) return "🇨🇳";
							if (ticker.includes("NGN")) return "🇳🇬";
							return "💱";
						};

						return {
							id: index + 1,
							symbol: getDisplaySymbol(fx.Ticker),
							name: getDisplayName(fx.Ticker),
							price: fx.Price.toFixed(4),
							change24h: "N/A", // Not provided by current API
							volume: "N/A", // Not provided by current API
							spread: "N/A", // Not provided by API
							trend: "up", // Default since we don't have change data
							logo: getLogo(fx.Ticker)
						};
					}
				);

				// Transform tokens data (DexScreener format is already transformed in the API)
				const transformedTokens: Token[] = tokensData.data;

				setApiData((prev) => ({
					...prev,
					tokens: transformedTokens,
					stocks: transformedStocks,
					fx: transformedFX
				}));
			} catch (error) {
				console.error("Error fetching trending data:", error);
				// Keep empty arrays when API fails - no mock data fallback
				setApiData({
					tokens: [],
					stocks: [],
					fx: []
				});
			} finally {
				setIsLoading(false);
			}
		};

		fetchTrendingData();
	}, []);

	// Filter data based on search query
	const filteredTokens = apiData.tokens.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredFX = apiData.fx.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredStocks = apiData.stocks.filter(
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
												<div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden">
													{item.logo &&
													item.logo.startsWith(
														"http"
													) ? (
														<img
															src={item.logo}
															alt={item.symbol}
															className="w-full h-full object-cover rounded-full"
															onError={(e) => {
																e.currentTarget.style.display =
																	"none";
																e.currentTarget.parentElement!.textContent =
																	"🪙";
															}}
														/>
													) : (
														item.logo || "🪙"
													)}
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
												{searchQuery
													? "No items found"
													: "No data available"}
											</div>
											<div className="text-sm">
												{searchQuery
													? "Try adjusting your search terms"
													: "Unable to fetch data from API"}
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

				{/* All Trading Panels */}
				{isLoading ? (
					<div className="text-center py-12">
						<div className="text-white text-lg mb-2">
							Loading trending assets...
						</div>
						<div className="text-gray-400">
							Fetching real-time market data
						</div>
					</div>
				) : (
					<>
						{renderTable(filteredTokens, "Top Trending Tokens")}
						{renderTable(filteredFX, "Trending FX", true)}
						{renderTable(filteredStocks, "Trending Stocks")}
					</>
				)}
			</main>
		</div>
	);
}
