import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock leaderboard data
const topTraders = [
	{
		id: 1,
		rank: 1,
		username: "CryptoKing123",
		avatar: "👑",
		pnl: "+$125,450.00",
		pnlPercent: "+45.67%",
		winRate: "78.5%",
		totalTrades: 1250,
		volume: "$2.5M",
		followers: 4520
	},
	{
		id: 2,
		rank: 2,
		username: "DefiMaster",
		avatar: "🚀",
		pnl: "+$89,230.00",
		pnlPercent: "+32.14%",
		winRate: "73.2%",
		totalTrades: 980,
		volume: "$1.8M",
		followers: 3210
	},
	{
		id: 3,
		rank: 3,
		username: "WhaleWatcher",
		avatar: "🐋",
		pnl: "+$76,890.00",
		pnlPercent: "+28.93%",
		winRate: "69.8%",
		totalTrades: 1450,
		volume: "$3.2M",
		followers: 5680
	},
	{
		id: 4,
		rank: 4,
		username: "TradingBot",
		avatar: "🤖",
		pnl: "+$65,340.00",
		pnlPercent: "+25.18%",
		winRate: "82.1%",
		totalTrades: 2340,
		volume: "$1.5M",
		followers: 2890
	},
	{
		id: 5,
		rank: 5,
		username: "AltcoinAlpha",
		avatar: "⚡",
		pnl: "+$54,670.00",
		pnlPercent: "+21.84%",
		winRate: "66.4%",
		totalTrades: 890,
		volume: "$980K",
		followers: 1540
	}
];

const topVolume = [
	{
		id: 1,
		rank: 1,
		username: "VolumeKing",
		avatar: "💎",
		volume: "$12.5M",
		trades: 5640,
		avgTradeSize: "$2,216",
		pnl: "+$45,230.00"
	},
	{
		id: 2,
		rank: 2,
		username: "BigMoney",
		avatar: "💰",
		volume: "$8.9M",
		trades: 2340,
		avgTradeSize: "$3,803",
		pnl: "+$32,100.00"
	},
	{
		id: 3,
		rank: 3,
		username: "InstitutionalFlow",
		avatar: "🏦",
		volume: "$7.2M",
		trades: 1890,
		avgTradeSize: "$3,810",
		pnl: "+$28,670.00"
	}
];

export default function LeaderboardPage() {
	return (
		<div className="min-h-screen bg-gray-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Leaderboard
					</h1>
					<p className="text-gray-400">
						Top performing traders and their strategies
					</p>
				</div>

				{/* Stats Overview */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Total Traders
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								12,847
							</div>
							<div className="text-sm text-green-400">
								+5.2% this week
							</div>
						</CardContent>
					</Card>
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Total Volume
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								$125.6M
							</div>
							<div className="text-sm text-green-400">
								+12.8% this week
							</div>
						</CardContent>
					</Card>
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Profitable Traders
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								68.4%
							</div>
							<div className="text-sm text-green-400">
								+2.1% this week
							</div>
						</CardContent>
					</Card>
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white text-sm">
								Avg Win Rate
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								62.3%
							</div>
							<div className="text-sm text-red-400">
								-0.8% this week
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Leaderboard Tabs */}
				<Card className="bg-slate-900 border-slate-800">
					<CardHeader>
						<Tabs defaultValue="pnl" className="w-full">
							<TabsList className="grid w-full grid-cols-3 bg-slate-800">
								<TabsTrigger
									value="pnl"
									className="data-[state=active]:bg-slate-700"
								>
									Top PnL
								</TabsTrigger>
								<TabsTrigger
									value="volume"
									className="data-[state=active]:bg-slate-700"
								>
									Top Volume
								</TabsTrigger>
								<TabsTrigger
									value="winrate"
									className="data-[state=active]:bg-slate-700"
								>
									Top Win Rate
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="pnl" className="w-full">
							{/* Top PnL Tab */}
							<TabsContent value="pnl">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-slate-800">
												<th className="text-left p-4 text-gray-400 font-medium">
													Rank
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Trader
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													PnL
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Win Rate
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Total Trades
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Volume
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Followers
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Action
												</th>
											</tr>
										</thead>
										<tbody>
											{topTraders.map((trader) => (
												<tr
													key={trader.id}
													className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
												>
													<td className="p-4">
														<div className="flex items-center">
															{trader.rank <=
																3 && (
																<span className="mr-2 text-lg">
																	{trader.rank ===
																	1
																		? "🥇"
																		: trader.rank ===
																		  2
																		? "🥈"
																		: "🥉"}
																</span>
															)}
															<span className="text-white font-bold">
																#{trader.rank}
															</span>
														</div>
													</td>
													<td className="p-4">
														<div className="flex items-center space-x-3">
															<div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">
																{trader.avatar}
															</div>
															<div>
																<div className="text-white font-medium">
																	{
																		trader.username
																	}
																</div>
																<div className="text-gray-400 text-sm">
																	{
																		trader.followers
																	}{" "}
																	followers
																</div>
															</div>
														</div>
													</td>
													<td className="p-4">
														<div className="text-green-400 font-bold">
															{trader.pnl}
														</div>
														<div className="text-green-400 text-sm">
															{trader.pnlPercent}
														</div>
													</td>
													<td className="p-4">
														<Badge className="bg-blue-600 hover:bg-blue-700">
															{trader.winRate}
														</Badge>
													</td>
													<td className="p-4 text-gray-300">
														{trader.totalTrades}
													</td>
													<td className="p-4 text-white font-medium">
														{trader.volume}
													</td>
													<td className="p-4 text-gray-300">
														{trader.followers}
													</td>
													<td className="p-4">
														<button className="px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 transition-colors">
															Follow
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</TabsContent>

							{/* Top Volume Tab */}
							<TabsContent value="volume">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-slate-800">
												<th className="text-left p-4 text-gray-400 font-medium">
													Rank
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Trader
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Volume
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Total Trades
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Avg Trade Size
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													PnL
												</th>
												<th className="text-left p-4 text-gray-400 font-medium">
													Action
												</th>
											</tr>
										</thead>
										<tbody>
											{topVolume.map((trader) => (
												<tr
													key={trader.id}
													className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
												>
													<td className="p-4">
														<div className="flex items-center">
															{trader.rank <=
																3 && (
																<span className="mr-2 text-lg">
																	{trader.rank ===
																	1
																		? "🥇"
																		: trader.rank ===
																		  2
																		? "🥈"
																		: "🥉"}
																</span>
															)}
															<span className="text-white font-bold">
																#{trader.rank}
															</span>
														</div>
													</td>
													<td className="p-4">
														<div className="flex items-center space-x-3">
															<div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl">
																{trader.avatar}
															</div>
															<div className="text-white font-medium">
																{
																	trader.username
																}
															</div>
														</div>
													</td>
													<td className="p-4 text-white font-bold">
														{trader.volume}
													</td>
													<td className="p-4 text-gray-300">
														{trader.trades}
													</td>
													<td className="p-4 text-gray-300">
														{trader.avgTradeSize}
													</td>
													<td className="p-4 text-green-400 font-medium">
														{trader.pnl}
													</td>
													<td className="p-4">
														<button className="px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 transition-colors">
															Follow
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</TabsContent>

							{/* Top Win Rate Tab */}
							<TabsContent value="winrate">
								<div className="text-center py-8">
									<div className="text-6xl mb-4">🏆</div>
									<div className="text-xl text-white mb-2">
										Win Rate Leaderboard
									</div>
									<div className="text-gray-400">
										Coming soon - Track the most consistent
										traders
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>

				{/* Featured Strategies */}
				<div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{[
						{
							title: "Momentum Trading",
							description:
								"Following strong price trends with technical indicators",
							traders: 245,
							avgReturn: "+18.5%",
							risk: "Medium"
						},
						{
							title: "Mean Reversion",
							description:
								"Buying oversold and selling overbought conditions",
							traders: 189,
							avgReturn: "+12.3%",
							risk: "Low"
						},
						{
							title: "Breakout Strategy",
							description:
								"Trading breakouts from key support/resistance levels",
							traders: 156,
							avgReturn: "+24.7%",
							risk: "High"
						}
					].map((strategy, index) => (
						<Card
							key={index}
							className="bg-slate-900 border-slate-800"
						>
							<CardHeader>
								<CardTitle className="text-white">
									{strategy.title}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<p className="text-gray-400 text-sm">
									{strategy.description}
								</p>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Traders:
									</span>
									<span className="text-white">
										{strategy.traders}
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Avg Return:
									</span>
									<span className="text-green-400 font-medium">
										{strategy.avgReturn}
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-400">
										Risk Level:
									</span>
									<Badge
										variant={
											strategy.risk === "Low"
												? "default"
												: strategy.risk === "Medium"
												? "destructive"
												: "destructive"
										}
										className={
											strategy.risk === "Low"
												? "bg-green-600 hover:bg-green-700"
												: strategy.risk === "Medium"
												? "bg-yellow-600 hover:bg-yellow-700"
												: "bg-red-600 hover:bg-red-700"
										}
									>
										{strategy.risk}
									</Badge>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</main>
		</div>
	);
}
