import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Mock trending tokens data
const trendingTokens = [
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

export default function Home() {
	return (
		<div className="min-h-screen bg-gray-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Trending Tokens
					</h1>
					<p className="text-gray-400">
						Discover the most popular tokens and their market
						performance
					</p>
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
								Active Tokens
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-teal-400">
								2,847
							</div>
							<div className="text-sm text-gray-400">
								Tracked tokens
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Trending Tokens Table */}
				<Card className="bg-slate-900 border-slate-800">
					<CardHeader>
						<CardTitle className="text-white">
							Top Trending Tokens
						</CardTitle>
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
											Token
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Price
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											24h Change
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Volume
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Market Cap
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Action
										</th>
									</tr>
								</thead>
								<tbody>
									{trendingTokens.map((token, index) => (
										<tr
											key={token.id}
											className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
										>
											<td className="p-4 text-gray-300">
												{index + 1}
											</td>
											<td className="p-4">
												<div className="flex items-center space-x-3">
													<div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold">
														{token.logo}
													</div>
													<div>
														<div className="text-white font-medium">
															{token.symbol}
														</div>
														<div className="text-gray-400 text-sm">
															{token.name}
														</div>
													</div>
												</div>
											</td>
											<td className="p-4 text-white font-medium">
												{token.price}
											</td>
											<td className="p-4">
												<Badge
													variant={
														token.trend === "up"
															? "default"
															: "destructive"
													}
													className={
														token.trend === "up"
															? "bg-green-600 hover:bg-green-700"
															: "bg-red-600 hover:bg-red-700"
													}
												>
													{token.change24h}
												</Badge>
											</td>
											<td className="p-4 text-gray-300">
												{token.volume}
											</td>
											<td className="p-4 text-gray-300">
												{token.marketCap}
											</td>
											<td className="p-4">
												<button className="px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 transition-colors">
													Trade
												</button>
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
