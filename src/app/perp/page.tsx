"use client";

import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Mock perpetual positions data
const positions = [
	{
		id: 1,
		pair: "BTC/USDT",
		side: "Long",
		size: "0.5 BTC",
		entryPrice: "$44,200",
		markPrice: "$45,234",
		pnl: "+$517.00",
		pnlPercent: "+2.34%",
		margin: "$2,210",
		leverage: "10x"
	},
	{
		id: 2,
		pair: "ETH/USDT",
		side: "Short",
		size: "5 ETH",
		entryPrice: "$2,520",
		markPrice: "$2,456",
		pnl: "+$320.00",
		pnlPercent: "+2.54%",
		margin: "$1,228",
		leverage: "10x"
	}
];

export default function PerpPage() {
	const searchParams = useSearchParams();
	const [tradingPair, setTradingPair] = useState({
		symbol: "BTC/USDT",
		price: "$45,234.56",
		change: "+2.34%",
		pairAddress: "0x638f567d445E60E1aC1AfD369f53176FE9D5F93D"
	});

	useEffect(() => {
		const symbol = searchParams.get("symbol");
		const pairAddress = searchParams.get("pairAddress");

		if (symbol) {
			// Format the symbol for display (add /USDT if not already present)
			const formattedSymbol = symbol.includes("/")
				? symbol
				: `${symbol}/USDT`;

			setTradingPair((prev) => ({
				...prev,
				symbol: formattedSymbol,
				pairAddress: pairAddress || prev.pairAddress
			}));
		}
	}, [searchParams]);

	// Generate chart URL based on pair address
	const getChartUrl = () => {
		const baseUrl = "https://dexscreener.com";
		if (tradingPair.pairAddress) {
			console.log("Using pair address:", tradingPair.pairAddress);
			return (
				"https://dexscreener.com/bsc/" +
				tradingPair.pairAddress +
				"?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15"
			);
		}
		// Fallback to default chart
		return "";
	};

	return (
		<div className="min-h-screen bg-gray-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Perpetual Trading
					</h1>
					<p className="text-gray-400">
						Trade cryptocurrency perpetual futures with up to 100x
						leverage
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Trading Panel */}
					<div className="lg:col-span-2 space-y-6">
						{/* Price Chart Placeholder */}
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white flex items-center justify-between">
									<span>{tradingPair.symbol} Perpetual</span>
									<div className="flex items-center space-x-4">
										<div className="text-2xl font-bold text-green-400">
											{tradingPair.price}
										</div>
										<Badge className="bg-green-600 hover:bg-green-700">
											{tradingPair.change}
										</Badge>
									</div>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div id="dexscreener-embed">
									<iframe
										src={getChartUrl()}
										width="100%"
										height="500"
										style={{ border: "none" }}
										title={`${tradingPair.symbol} Chart`}
									></iframe>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Trading Form */}
					<div className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">
									Place Order
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<Tabs defaultValue="market" className="w-full">
									<TabsList className="grid w-full grid-cols-2 bg-slate-800">
										<TabsTrigger
											value="market"
											className="data-[state=active]:bg-slate-700"
										>
											Market
										</TabsTrigger>
										<TabsTrigger
											value="limit"
											className="data-[state=active]:bg-slate-700"
										>
											Limit
										</TabsTrigger>
									</TabsList>

									<TabsContent
										value="market"
										className="space-y-4"
									>
										<div className="grid grid-cols-2 gap-2">
											<Button className="bg-green-600 hover:bg-green-700 text-white">
												Long
											</Button>
											<Button
												variant="outline"
												className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
											>
												Short
											</Button>
										</div>

										<div className="space-y-3">
											<div>
												<label className="text-sm text-gray-400 mb-1 block">
													Size (
													{
														tradingPair.symbol.split(
															"/"
														)[0]
													}
													)
												</label>
												<Input
													placeholder="0.00"
													className="bg-slate-800 border-slate-700 text-white"
												/>
											</div>

											<div>
												<label className="text-sm text-gray-400 mb-1 block">
													Leverage
												</label>
												<Select>
													<SelectTrigger className="bg-slate-800 border-slate-700 text-white">
														<SelectValue placeholder="10x" />
													</SelectTrigger>
													<SelectContent className="bg-slate-800 border-slate-700">
														<SelectItem value="1">
															1x
														</SelectItem>
														<SelectItem value="5">
															5x
														</SelectItem>
														<SelectItem value="10">
															10x
														</SelectItem>
														<SelectItem value="25">
															25x
														</SelectItem>
														<SelectItem value="50">
															50x
														</SelectItem>
														<SelectItem value="100">
															100x
														</SelectItem>
													</SelectContent>
												</Select>
											</div>

											<div className="text-sm text-gray-400 space-y-1">
												<div className="flex justify-between">
													<span>
														Est. Entry Price:
													</span>
													<span className="text-white">
														{tradingPair.price}
													</span>
												</div>
												<div className="flex justify-between">
													<span>
														Required Margin:
													</span>
													<span className="text-white">
														$452.35
													</span>
												</div>
												<div className="flex justify-between">
													<span>Trading Fee:</span>
													<span className="text-white">
														$2.26
													</span>
												</div>
											</div>

											<Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">
												Open Long Position
											</Button>
										</div>
									</TabsContent>

									<TabsContent
										value="limit"
										className="space-y-4"
									>
										<div className="grid grid-cols-2 gap-2">
											<Button className="bg-green-600 hover:bg-green-700 text-white">
												Long
											</Button>
											<Button
												variant="outline"
												className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
											>
												Short
											</Button>
										</div>

										<div className="space-y-3">
											<div>
												<label className="text-sm text-gray-400 mb-1 block">
													Price (USDT)
												</label>
												<Input
													placeholder="45,000.00"
													className="bg-slate-800 border-slate-700 text-white"
												/>
											</div>

											<div>
												<label className="text-sm text-gray-400 mb-1 block">
													Size (
													{
														tradingPair.symbol.split(
															"/"
														)[0]
													}
													)
												</label>
												<Input
													placeholder="0.00"
													className="bg-slate-800 border-slate-700 text-white"
												/>
											</div>

											<div>
												<label className="text-sm text-gray-400 mb-1 block">
													Leverage
												</label>
												<Select>
													<SelectTrigger className="bg-slate-800 border-slate-700 text-white">
														<SelectValue placeholder="10x" />
													</SelectTrigger>
													<SelectContent className="bg-slate-800 border-slate-700">
														<SelectItem value="1">
															1x
														</SelectItem>
														<SelectItem value="5">
															5x
														</SelectItem>
														<SelectItem value="10">
															10x
														</SelectItem>
														<SelectItem value="25">
															25x
														</SelectItem>
														<SelectItem value="50">
															50x
														</SelectItem>
														<SelectItem value="100">
															100x
														</SelectItem>
													</SelectContent>
												</Select>
											</div>

											<Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">
												Place Limit Order
											</Button>
										</div>
									</TabsContent>
								</Tabs>
							</CardContent>
						</Card>

						{/* Account Info */}
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white text-lg">
									Account
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Available Balance:
									</span>
									<span className="text-white font-medium">
										$12,456.78
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Used Margin:
									</span>
									<span className="text-white font-medium">
										$3,438.00
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Free Margin:
									</span>
									<span className="text-white font-medium">
										$9,018.78
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Unrealized PnL:
									</span>
									<span className="text-green-400 font-medium">
										+$837.00
									</span>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Positions Table */}
				<Card className="bg-slate-900 border-slate-800 mt-8">
					<CardHeader>
						<CardTitle className="text-white">
							Open Positions
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 font-medium">
											Pair
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Side
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Size
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Entry Price
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Mark Price
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											PnL
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Margin
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Action
										</th>
									</tr>
								</thead>
								<tbody>
									{positions.map((position) => (
										<tr
											key={position.id}
											className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
										>
											<td className="p-4 text-white font-medium">
												{position.pair}
											</td>
											<td className="p-4">
												<Badge
													variant={
														position.side === "Long"
															? "default"
															: "destructive"
													}
													className={
														position.side === "Long"
															? "bg-green-600 hover:bg-green-700"
															: "bg-red-600 hover:bg-red-700"
													}
												>
													{position.side}
												</Badge>
											</td>
											<td className="p-4 text-white">
												{position.size}
											</td>
											<td className="p-4 text-gray-300">
												{position.entryPrice}
											</td>
											<td className="p-4 text-white">
												{position.markPrice}
											</td>
											<td className="p-4">
												<div className="text-green-400 font-medium">
													{position.pnl}
												</div>
												<div className="text-green-400 text-sm">
													{position.pnlPercent}
												</div>
											</td>
											<td className="p-4 text-gray-300">
												{position.margin}
											</td>
											<td className="p-4">
												<Button
													size="sm"
													variant="outline"
													className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
												>
													Close
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
