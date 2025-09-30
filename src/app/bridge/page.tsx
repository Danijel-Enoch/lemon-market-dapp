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

// Mock supported networks and tokens
const networks = [
	{ id: "ethereum", name: "Ethereum", symbol: "ETH", color: "bg-blue-500" },
	{ id: "polygon", name: "Polygon", symbol: "MATIC", color: "bg-purple-500" },
	{ id: "bsc", name: "BSC", symbol: "BNB", color: "bg-yellow-500" },
	{ id: "arbitrum", name: "Arbitrum", symbol: "ARB", color: "bg-cyan-500" },
	{ id: "optimism", name: "Optimism", symbol: "OP", color: "bg-red-500" }
];

const tokens = [
	{ symbol: "ETH", name: "Ethereum", balance: "2.456", price: "$2,456.78" },
	{ symbol: "USDT", name: "Tether", balance: "1,250.00", price: "$1.00" },
	{ symbol: "USDC", name: "USD Coin", balance: "850.50", price: "$1.00" },
	{
		symbol: "WBTC",
		name: "Wrapped Bitcoin",
		balance: "0.125",
		price: "$45,234.56"
	},
	{ symbol: "DAI", name: "Dai Stablecoin", balance: "500.00", price: "$1.00" }
];

// Mock transaction history
const recentTransactions = [
	{
		id: 1,
		type: "Bridge",
		from: "Ethereum",
		to: "Polygon",
		amount: "100 USDT",
		status: "Completed",
		time: "2 mins ago",
		hash: "0x1234...5678"
	},
	{
		id: 2,
		type: "Swap",
		from: "ETH",
		to: "USDT",
		amount: "0.5 ETH",
		status: "Pending",
		time: "5 mins ago",
		hash: "0xabcd...efgh"
	},
	{
		id: 3,
		type: "Bridge",
		from: "BSC",
		to: "Ethereum",
		amount: "50 USDC",
		status: "Completed",
		time: "1 hour ago",
		hash: "0x9876...5432"
	}
];

export default function BridgeSwapPage() {
	return (
		<div className="min-h-screen bg-gray-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Bridge & Swap
					</h1>
					<p className="text-gray-400">
						Bridge tokens across chains and swap between different
						cryptocurrencies
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Main Trading Panel */}
					<div className="lg:col-span-2">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<Tabs defaultValue="swap" className="w-full">
									<TabsList className="grid w-full grid-cols-2 bg-slate-800">
										<TabsTrigger
											value="swap"
											className="data-[state=active]:bg-slate-700"
										>
											Swap
										</TabsTrigger>
										<TabsTrigger
											value="bridge"
											className="data-[state=active]:bg-slate-700"
										>
											Bridge
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</CardHeader>
							<CardContent>
								<Tabs defaultValue="swap" className="w-full">
									{/* Swap Tab */}
									<TabsContent
										value="swap"
										className="space-y-6"
									>
										<div className="space-y-4">
											{/* From Token */}
											<div className="space-y-2">
												<label className="text-sm text-gray-400">
													From
												</label>
												<div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
													<div className="flex items-center justify-between mb-3">
														<Select>
															<SelectTrigger className="w-40 bg-slate-700 border-slate-600">
																<SelectValue placeholder="ETH" />
															</SelectTrigger>
															<SelectContent className="bg-slate-800 border-slate-700">
																{tokens.map(
																	(token) => (
																		<SelectItem
																			key={
																				token.symbol
																			}
																			value={
																				token.symbol
																			}
																		>
																			<div className="flex items-center space-x-2">
																				<div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
																					{
																						token
																							.symbol[0]
																					}
																				</div>
																				<span>
																					{
																						token.symbol
																					}
																				</span>
																			</div>
																		</SelectItem>
																	)
																)}
															</SelectContent>
														</Select>
														<div className="text-right">
															<div className="text-sm text-gray-400">
																Balance: 2.456
																ETH
															</div>
														</div>
													</div>
													<Input
														placeholder="0.0"
														className="text-2xl bg-transparent border-none p-0 h-auto text-white font-bold"
													/>
													<div className="text-sm text-gray-400 mt-1">
														≈ $2,456.78
													</div>
												</div>
											</div>

											{/* Swap Arrow */}
											<div className="flex justify-center">
												<button className="p-2 bg-slate-800 rounded-full border-2 border-slate-700 hover:border-teal-500 transition-colors">
													<svg
														className="w-5 h-5 text-gray-400"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
														/>
													</svg>
												</button>
											</div>

											{/* To Token */}
											<div className="space-y-2">
												<label className="text-sm text-gray-400">
													To
												</label>
												<div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
													<div className="flex items-center justify-between mb-3">
														<Select>
															<SelectTrigger className="w-40 bg-slate-700 border-slate-600">
																<SelectValue placeholder="USDT" />
															</SelectTrigger>
															<SelectContent className="bg-slate-800 border-slate-700">
																{tokens.map(
																	(token) => (
																		<SelectItem
																			key={
																				token.symbol
																			}
																			value={
																				token.symbol
																			}
																		>
																			<div className="flex items-center space-x-2">
																				<div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
																					{
																						token
																							.symbol[0]
																					}
																				</div>
																				<span>
																					{
																						token.symbol
																					}
																				</span>
																			</div>
																		</SelectItem>
																	)
																)}
															</SelectContent>
														</Select>
														<div className="text-right">
															<div className="text-sm text-gray-400">
																Balance:
																1,250.00 USDT
															</div>
														</div>
													</div>
													<div className="text-2xl text-white font-bold">
														2,456.78
													</div>
													<div className="text-sm text-gray-400 mt-1">
														≈ $2,456.78
													</div>
												</div>
											</div>

											{/* Swap Details */}
											<div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-gray-400">
														Exchange Rate:
													</span>
													<span className="text-white">
														1 ETH = 2,456.78 USDT
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														Price Impact:
													</span>
													<span className="text-green-400">
														&lt; 0.01%
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														Slippage Tolerance:
													</span>
													<span className="text-white">
														0.5%
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														Network Fee:
													</span>
													<span className="text-white">
														~$12.50
													</span>
												</div>
											</div>

											<Button className="w-full bg-teal-600 hover:bg-teal-700 text-white py-6 text-lg">
												Swap Tokens
											</Button>
										</div>
									</TabsContent>

									{/* Bridge Tab */}
									<TabsContent
										value="bridge"
										className="space-y-6"
									>
										<div className="space-y-4">
											{/* From Network */}
											<div className="space-y-2">
												<label className="text-sm text-gray-400">
													From Network
												</label>
												<Select>
													<SelectTrigger className="bg-slate-800 border-slate-700">
														<SelectValue placeholder="Select network" />
													</SelectTrigger>
													<SelectContent className="bg-slate-800 border-slate-700">
														{networks.map(
															(network) => (
																<SelectItem
																	key={
																		network.id
																	}
																	value={
																		network.id
																	}
																>
																	<div className="flex items-center space-x-3">
																		<div
																			className={`w-4 h-4 rounded-full ${network.color}`}
																		></div>
																		<span>
																			{
																				network.name
																			}
																		</span>
																	</div>
																</SelectItem>
															)
														)}
													</SelectContent>
												</Select>
											</div>

											{/* To Network */}
											<div className="space-y-2">
												<label className="text-sm text-gray-400">
													To Network
												</label>
												<Select>
													<SelectTrigger className="bg-slate-800 border-slate-700">
														<SelectValue placeholder="Select network" />
													</SelectTrigger>
													<SelectContent className="bg-slate-800 border-slate-700">
														{networks.map(
															(network) => (
																<SelectItem
																	key={
																		network.id
																	}
																	value={
																		network.id
																	}
																>
																	<div className="flex items-center space-x-3">
																		<div
																			className={`w-4 h-4 rounded-full ${network.color}`}
																		></div>
																		<span>
																			{
																				network.name
																			}
																		</span>
																	</div>
																</SelectItem>
															)
														)}
													</SelectContent>
												</Select>
											</div>

											{/* Token and Amount */}
											<div className="space-y-2">
												<label className="text-sm text-gray-400">
													Token & Amount
												</label>
												<div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
													<div className="flex items-center justify-between mb-3">
														<Select>
															<SelectTrigger className="w-40 bg-slate-700 border-slate-600">
																<SelectValue placeholder="USDT" />
															</SelectTrigger>
															<SelectContent className="bg-slate-800 border-slate-700">
																{tokens.map(
																	(token) => (
																		<SelectItem
																			key={
																				token.symbol
																			}
																			value={
																				token.symbol
																			}
																		>
																			<div className="flex items-center space-x-2">
																				<div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
																					{
																						token
																							.symbol[0]
																					}
																				</div>
																				<span>
																					{
																						token.symbol
																					}
																				</span>
																			</div>
																		</SelectItem>
																	)
																)}
															</SelectContent>
														</Select>
														<div className="text-right">
															<div className="text-sm text-gray-400">
																Balance:
																1,250.00 USDT
															</div>
														</div>
													</div>
													<Input
														placeholder="0.0"
														className="text-2xl bg-transparent border-none p-0 h-auto text-white font-bold"
													/>
													<div className="text-sm text-gray-400 mt-1">
														≈ $100.00
													</div>
												</div>
											</div>

											{/* Bridge Details */}
											<div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-gray-400">
														Bridge Fee:
													</span>
													<span className="text-white">
														$5.00
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														Network Fee:
													</span>
													<span className="text-white">
														~$15.00
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														Estimated Time:
													</span>
													<span className="text-white">
														5-10 minutes
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-gray-400">
														You'll Receive:
													</span>
													<span className="text-white">
														~95.00 USDT
													</span>
												</div>
											</div>

											<Button className="w-full bg-teal-600 hover:bg-teal-700 text-white py-6 text-lg">
												Bridge Tokens
											</Button>
										</div>
									</TabsContent>
								</Tabs>
							</CardContent>
						</Card>
					</div>

					{/* Sidebar */}
					<div className="space-y-6">
						{/* Portfolio */}
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">
									Portfolio
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{tokens.slice(0, 4).map((token) => (
									<div
										key={token.symbol}
										className="flex items-center justify-between"
									>
										<div className="flex items-center space-x-3">
											<div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
												{token.symbol[0]}
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
										<div className="text-right">
											<div className="text-white font-medium">
												{token.balance}
											</div>
											<div className="text-gray-400 text-sm">
												{token.price}
											</div>
										</div>
									</div>
								))}
							</CardContent>
						</Card>

						{/* Quick Actions */}
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">
									Quick Actions
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<Button
									variant="outline"
									className="w-full border-slate-700 text-gray-300 hover:bg-slate-800"
								>
									Add Token
								</Button>
								<Button
									variant="outline"
									className="w-full border-slate-700 text-gray-300 hover:bg-slate-800"
								>
									Transaction History
								</Button>
								<Button
									variant="outline"
									className="w-full border-slate-700 text-gray-300 hover:bg-slate-800"
								>
									Bridge Settings
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Recent Transactions */}
				<Card className="bg-slate-900 border-slate-800 mt-8">
					<CardHeader>
						<CardTitle className="text-white">
							Recent Transactions
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 font-medium">
											Type
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											From
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											To
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Amount
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Status
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Time
										</th>
										<th className="text-left p-4 text-gray-400 font-medium">
											Hash
										</th>
									</tr>
								</thead>
								<tbody>
									{recentTransactions.map((tx) => (
										<tr
											key={tx.id}
											className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
										>
											<td className="p-4">
												<Badge
													variant="outline"
													className="border-teal-600 text-teal-400"
												>
													{tx.type}
												</Badge>
											</td>
											<td className="p-4 text-white">
												{tx.from}
											</td>
											<td className="p-4 text-white">
												{tx.to}
											</td>
											<td className="p-4 text-white font-medium">
												{tx.amount}
											</td>
											<td className="p-4">
												<Badge
													variant={
														tx.status ===
														"Completed"
															? "default"
															: "destructive"
													}
													className={
														tx.status ===
														"Completed"
															? "bg-green-600 hover:bg-green-700"
															: "bg-yellow-600 hover:bg-yellow-700"
													}
												>
													{tx.status}
												</Badge>
											</td>
											<td className="p-4 text-gray-400">
												{tx.time}
											</td>
											<td className="p-4">
												<button className="text-teal-400 hover:text-teal-300 font-mono text-sm">
													{tx.hash}
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
