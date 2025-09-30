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

	// Trading form state
	const [isLong, setIsLong] = useState(true);
	const [valueUSDC, setValueUSDC] = useState("100");
	const [leverage, setLeverage] = useState(2);
	const [bnbAmount, setBnbAmount] = useState("0.51451404");

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

	// Handle leverage changes
	const handleLeverageChange = (delta: number) => {
		const newLeverage = Math.max(1, Math.min(5, leverage + delta));
		setLeverage(newLeverage);
	};

	// Handle place transaction
	const handlePlaceTransaction = () => {
		console.log("Placing transaction:", {
			side: isLong ? "Long" : "Short",
			valueUSDC,
			leverage,
			bnbAmount
		});
		// Add your transaction logic here
	};

	// Generate chart URL based on pair address
	const getChartUrl = () => {
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
						Trade cryptocurrency perpetual futures with up to 2x
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
							<CardContent className="space-y-6 p-6">
								{/* Long/Short Toggle */}
								<div className="grid grid-cols-2 gap-1 bg-slate-800 p-1 rounded-lg">
									<Button
										onClick={() => setIsLong(true)}
										className={`rounded-md h-12 font-semibold ${
											isLong
												? "bg-green-500 hover:bg-green-600 text-white"
												: "bg-transparent text-gray-400 hover:text-white"
										}`}
									>
										LONG
									</Button>
									<Button
										onClick={() => setIsLong(false)}
										className={`rounded-md h-12 font-semibold ${
											!isLong
												? "bg-red-500 hover:bg-red-600 text-white"
												: "bg-transparent text-gray-400 hover:text-white"
										}`}
									>
										SHORT
									</Button>
								</div>

								{/* Value Input */}
								<div className="space-y-2">
									<label className="text-sm text-cyan-400 uppercase font-medium">
										Value (USDC)
									</label>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
												<span className="text-white text-xs font-bold">
													$
												</span>
											</div>
										</div>
										<Input
											placeholder="100"
											value={valueUSDC}
											onChange={(e) =>
												setValueUSDC(e.target.value)
											}
											className="bg-slate-800 border-slate-700 text-white text-center text-2xl font-bold h-14 pl-12 pr-20"
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
											<div className="w-6 h-6 bg-gray-300 rounded"></div>
											<span className="text-cyan-400 font-medium">
												USDC
											</span>
										</div>
									</div>
								</div>

								{/* Leverage */}
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<label className="text-sm text-cyan-400 uppercase font-medium">
											Leverage
										</label>
										<span className="text-green-400 text-lg font-bold">
											{leverage}x
										</span>
									</div>
									<div className="relative">
										<div className="flex items-center space-x-4 bg-slate-800 rounded-lg p-4">
											<button
												onClick={() =>
													handleLeverageChange(-1)
												}
												className="w-8 h-8 border border-cyan-400 text-cyan-400 rounded-full flex items-center justify-center text-lg hover:bg-cyan-400 hover:text-black transition-colors"
											>
												-
											</button>
											<div className="flex-1 relative">
												<div className="h-2 bg-slate-700 rounded-full">
													<div
														className="h-2 bg-gradient-to-r from-green-400 to-cyan-400 rounded-full"
														style={{
															width: `${
																(leverage - 1) *
																25
															}%`
														}}
													></div>
												</div>
												<div className="flex justify-between text-xs text-gray-400 mt-2">
													<span
														className={
															leverage === 1
																? "text-cyan-400 font-bold"
																: ""
														}
													>
														1x
													</span>
													<span
														className={
															leverage === 2
																? "text-cyan-400 font-bold"
																: ""
														}
													>
														2x
													</span>
													<span
														className={
															leverage === 3
																? "text-cyan-400 font-bold"
																: ""
														}
													>
														3x
													</span>
													<span
														className={
															leverage === 4
																? "text-cyan-400 font-bold"
																: ""
														}
													>
														4x
													</span>
													<span
														className={
															leverage === 5
																? "text-cyan-400 font-bold"
																: ""
														}
													>
														5x
													</span>
												</div>
											</div>
											<button
												onClick={() =>
													handleLeverageChange(1)
												}
												className="w-8 h-8 border border-cyan-400 text-cyan-400 rounded-full flex items-center justify-center text-lg hover:bg-cyan-400 hover:text-black transition-colors"
											>
												+
											</button>
										</div>
									</div>
								</div>

								{/* You Pay */}
								<div className="space-y-2">
									<label className="text-sm text-cyan-400 uppercase font-medium">
										You Pay (BNB)
									</label>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-yellow-500 rounded-full"></div>
										</div>
										<Input
											placeholder="0.51451404"
											value={bnbAmount}
											onChange={(e) =>
												setBnbAmount(e.target.value)
											}
											className="bg-slate-800 border-slate-700 text-white text-center text-2xl font-bold h-14 pl-12 pr-16"
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2">
											<span className="text-cyan-400 font-medium">
												BNB
											</span>
										</div>
									</div>
								</div>

								{/* Position Details */}
								<div className="space-y-3 text-sm">
									<div className="flex justify-between">
										<span className="text-gray-400 uppercase">
											Position Size (BNB)
										</span>
										<span className="text-white">0</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-400 uppercase">
											Open Fee
										</span>
										<span className="text-white">
											0.022%
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-400 uppercase">
											Close Fee (Applied only to profits)
										</span>
										<span className="text-white">
											0.022%
										</span>
									</div>
								</div>

								{/* Place Transaction Button */}
								<Button
									onClick={handlePlaceTransaction}
									className="w-full bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600 text-white h-12 font-semibold text-lg"
								>
									Place Transaction
								</Button>
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
