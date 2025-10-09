import { Award, Target, TrendingUp, Trophy, Users, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
		followers: 4520,
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
		followers: 3210,
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
		followers: 5680,
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
		followers: 2890,
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
		followers: 1540,
	},
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
		pnl: "+$45,230.00",
	},
	{
		id: 2,
		rank: 2,
		username: "BigMoney",
		avatar: "💰",
		volume: "$8.9M",
		trades: 2340,
		avgTradeSize: "$3,803",
		pnl: "+$32,100.00",
	},
	{
		id: 3,
		rank: 3,
		username: "InstitutionalFlow",
		avatar: "🏦",
		volume: "$7.2M",
		trades: 1890,
		avgTradeSize: "$3,810",
		pnl: "+$28,670.00",
	},
];

export default function LeaderboardPage() {
	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-[1600px]">
				<div className="mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Trophy className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
							<p className="text-muted-foreground text-sm">Top performing traders and strategies</p>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Users className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Total Traders
								</div>
							</div>
							<div className="text-2xl font-bold">12,847</div>
							<div className="text-xs text-success mt-1">+5.2% this week</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Volume2 className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Total Volume
								</div>
							</div>
							<div className="text-2xl font-bold">$125.6M</div>
							<div className="text-xs text-success mt-1">+12.8% this week</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<TrendingUp className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Profitable
								</div>
							</div>
							<div className="text-2xl font-bold">68.4%</div>
							<div className="text-xs text-success mt-1">+2.1% this week</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Target className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Avg Win Rate
								</div>
							</div>
							<div className="text-2xl font-bold">62.3%</div>
							<div className="text-xs text-destructive mt-1">-0.8% this week</div>
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader className="border-b border-gray-100/10">
						<Tabs defaultValue="pnl" className="w-full">
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="pnl">Top PnL</TabsTrigger>
								<TabsTrigger value="volume">Top Volume</TabsTrigger>
								<TabsTrigger value="winrate">Top Win Rate</TabsTrigger>
							</TabsList>
						</Tabs>
					</CardHeader>
					<CardContent className="p-0">
						<Tabs defaultValue="pnl" className="w-full">
							<TabsContent value="pnl" className="m-0">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-gray-100/10 bg-muted/30">
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Rank
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Trader
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													PnL
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Win Rate
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Trades
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Volume
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Followers
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Action
												</th>
											</tr>
										</thead>
										<tbody>
											{topTraders.map((trader) => (
												<tr
													key={trader.id}
													className="border-b border-gray-100/10 hover:bg-card-hover transition-colors"
												>
													<td className="p-3">
														<div className="flex items-center gap-2">
															{trader.rank <= 3 && (
																<span className="text-lg">
																	{trader.rank === 1 ? "🥇" : trader.rank === 2 ? "🥈" : "🥉"}
																</span>
															)}
															<span className="font-bold text-sm">#{trader.rank}</span>
														</div>
													</td>
													<td className="p-3">
														<div className="flex items-center gap-3">
															<div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-lg">
																{trader.avatar}
															</div>
															<div>
																<div className="font-medium text-sm">{trader.username}</div>
																<div className="text-muted-foreground text-xs">
																	{trader.followers} followers
																</div>
															</div>
														</div>
													</td>
													<td className="p-3">
														<div className="text-success font-bold text-sm">{trader.pnl}</div>
														<div className="text-success text-xs">{trader.pnlPercent}</div>
													</td>
													<td className="p-3">
														<Badge className="bg-primary/10 text-primary border-primary/40">
															{trader.winRate}
														</Badge>
													</td>
													<td className="p-3 text-muted-foreground text-sm">
														{trader.totalTrades}
													</td>
													<td className="p-3 font-medium text-sm">{trader.volume}</td>
													<td className="p-3 text-muted-foreground text-sm">{trader.followers}</td>
													<td className="p-3">
														<Button size="sm">Follow</Button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</TabsContent>

							<TabsContent value="volume" className="m-0">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-gray-100/10 bg-muted/30">
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Rank
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Trader
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Volume
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Trades
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Avg Size
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													PnL
												</th>
												<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
													Action
												</th>
											</tr>
										</thead>
										<tbody>
											{topVolume.map((trader) => (
												<tr
													key={trader.id}
													className="border-b border-gray-100/10 hover:bg-card-hover transition-colors"
												>
													<td className="p-3">
														<div className="flex items-center gap-2">
															{trader.rank <= 3 && (
																<span className="text-lg">
																	{trader.rank === 1 ? "🥇" : trader.rank === 2 ? "🥈" : "🥉"}
																</span>
															)}
															<span className="font-bold text-sm">#{trader.rank}</span>
														</div>
													</td>
													<td className="p-3">
														<div className="flex items-center gap-3">
															<div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-lg">
																{trader.avatar}
															</div>
															<div className="font-medium text-sm">{trader.username}</div>
														</div>
													</td>
													<td className="p-3 font-bold text-sm">{trader.volume}</td>
													<td className="p-3 text-muted-foreground text-sm">{trader.trades}</td>
													<td className="p-3 text-muted-foreground text-sm">
														{trader.avgTradeSize}
													</td>
													<td className="p-3 text-success font-medium text-sm">{trader.pnl}</td>
													<td className="p-3">
														<Button size="sm">Follow</Button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</TabsContent>

							<TabsContent value="winrate" className="m-0">
								<div className="text-center py-16">
									<Award className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
									<div className="text-xl font-bold mb-2">Win Rate Leaderboard</div>
									<div className="text-muted-foreground text-sm">
										Coming soon - Track the most consistent traders
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>

				<div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
					{[
						{
							title: "Momentum Trading",
							description: "Following strong price trends with technical indicators",
							traders: 245,
							avgReturn: "+18.5%",
							risk: "Medium",
						},
						{
							title: "Mean Reversion",
							description: "Buying oversold and selling overbought conditions",
							traders: 189,
							avgReturn: "+12.3%",
							risk: "Low",
						},
						{
							title: "Breakout Strategy",
							description: "Trading breakouts from key support/resistance levels",
							traders: 156,
							avgReturn: "+24.7%",
							risk: "High",
						},
					].map((strategy, index) => (
						<Card key={index}>
							<CardHeader className="border-b border-gray-100/10">
								<CardTitle className="text-base">{strategy.title}</CardTitle>
							</CardHeader>
							<CardContent className="p-4 space-y-3">
								<p className="text-muted-foreground text-sm">{strategy.description}</p>
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Traders:</span>
										<span className="font-medium">{strategy.traders}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Avg Return:</span>
										<span className="text-success font-medium">{strategy.avgReturn}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Risk Level:</span>
										<Badge
											className={
												strategy.risk === "Low"
													? "bg-success/10 text-success border-success/20"
													: strategy.risk === "Medium"
														? "bg-warning/10 text-warning border-warning/20"
														: "bg-destructive/10 text-destructive border-destructive/20"
											}
										>
											{strategy.risk}
										</Badge>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</main>
		</div>
	);
}
