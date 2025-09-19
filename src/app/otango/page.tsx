import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function OTangoPage() {
	return (
		<div className="min-h-screen bg-slate-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">oTango</h1>
					<p className="text-gray-400">Option tokens for enhanced capital efficiency</p>
				</div>

				<Tabs defaultValue="overview" className="space-y-6">
					<TabsList className="bg-slate-900 border border-slate-800">
						<TabsTrigger value="overview" className="text-gray-400 data-[state=active]:text-white">
							Overview
						</TabsTrigger>
						<TabsTrigger value="mint" className="text-gray-400 data-[state=active]:text-white">
							Mint oTokens
						</TabsTrigger>
						<TabsTrigger value="exercise" className="text-gray-400 data-[state=active]:text-white">
							Exercise
						</TabsTrigger>
						<TabsTrigger value="portfolio" className="text-gray-400 data-[state=active]:text-white">
							Portfolio
						</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">Total Value Locked</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">$12.4M</div>
									<div className="text-sm text-green-400">+8.2% from last week</div>
								</CardContent>
							</Card>

							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">Active oTokens</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">156</div>
									<div className="text-sm text-gray-400">Across 8 markets</div>
								</CardContent>
							</Card>

							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">24h Volume</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">$2.1M</div>
									<div className="text-sm text-red-400">-5.1% from yesterday</div>
								</CardContent>
							</Card>
						</div>

						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Available oTokens</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									{[
										{
											token: "oETH-CALL-3000",
											expiry: "Mar 29, 2024",
											premium: "0.12 ETH",
											status: "Active",
										},
										{
											token: "oBTC-PUT-45000",
											expiry: "Apr 15, 2024",
											premium: "0.08 BTC",
											status: "Active",
										},
										{
											token: "oUSDC-CALL-1.05",
											expiry: "May 01, 2024",
											premium: "25 USDC",
											status: "Expired",
										},
									].map((option, idx) => (
										<div
											key={idx}
											className="flex items-center justify-between p-4 bg-slate-800 rounded-lg"
										>
											<div className="flex items-center space-x-4">
												<div>
													<div className="text-white font-semibold">{option.token}</div>
													<div className="text-gray-400 text-sm">Expires: {option.expiry}</div>
												</div>
											</div>
											<div className="flex items-center space-x-4">
												<div className="text-right">
													<div className="text-white">{option.premium}</div>
													<div className="text-gray-400 text-sm">Premium</div>
												</div>
												<Badge
													variant={option.status === "Active" ? "secondary" : "outline"}
													className={
														option.status === "Active"
															? "bg-teal-500/20 text-teal-400"
															: "text-gray-400 border-gray-600"
													}
												>
													{option.status}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="mint" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Mint New oTokens</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div>
										<label className="text-gray-400 text-sm mb-2 block">Underlying Asset</label>
										<select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
											<option>ETH</option>
											<option>BTC</option>
											<option>USDC</option>
										</select>
									</div>
									<div>
										<label className="text-gray-400 text-sm mb-2 block">Option Type</label>
										<select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
											<option>Call</option>
											<option>Put</option>
										</select>
									</div>
									<div>
										<label className="text-gray-400 text-sm mb-2 block">Strike Price</label>
										<input
											type="number"
											placeholder="3000"
											className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-gray-500"
										/>
									</div>
									<div>
										<label className="text-gray-400 text-sm mb-2 block">Expiry Date</label>
										<input
											type="date"
											className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white"
										/>
									</div>
								</div>
								<Button className="w-full bg-teal-500 hover:bg-teal-600">Mint oToken</Button>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="exercise" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Exercise Options</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-center py-12">
									<div className="text-gray-400 mb-4">No exercisable options found</div>
									<Button variant="outline" className="border-slate-700 text-gray-400">
										View All Options
									</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="portfolio" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Your oToken Portfolio</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-center py-12">
									<div className="text-gray-400 mb-4">Connect your wallet to view portfolio</div>
									<Button className="bg-teal-500 hover:bg-teal-600">Connect Wallet</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</main>
		</div>
	);
}
