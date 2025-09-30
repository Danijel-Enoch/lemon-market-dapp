import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function StakingPage() {
	return (
		<div className="min-h-screen bg-slate-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">
						Staking
					</h1>
					<p className="text-gray-400">
						Stake your tokens to earn rewards
					</p>
				</div>

				{/* Perp Trading Pool Contact Notice */}
				<Card className="bg-gradient-to-r from-teal-900/20 to-blue-900/20 border-teal-500/30 mb-8">
					<CardContent className="p-6">
						<div className="flex items-start space-x-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 bg-teal-500/20 rounded-full flex items-center justify-center">
									<svg
										className="w-6 h-6 text-teal-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<h3 className="text-lg font-semibold text-white mb-2">
									Perp Trading Pool Staking
								</h3>
								<p className="text-gray-300 mb-4">
									Interested in staking into our high-yield
									perpetual trading pool? Our perp trading
									strategies offer enhanced returns through
									automated market making and arbitrage
									opportunities.
								</p>
								<div className="flex flex-col sm:flex-row gap-3">
									<Button className="bg-teal-500 hover:bg-teal-600 text-white">
										Contact Developer
									</Button>
									<Button
										variant="outline"
										className="border-teal-500/50 text-teal-400 hover:bg-teal-500/10"
									>
										Learn More
									</Button>
								</div>
								<div className="mt-4 flex items-center space-x-6 text-sm text-gray-400">
									<div>
										<span className="text-teal-400 font-semibold">
											Expected APY:
										</span>{" "}
										25-40%
									</div>
									<div>
										<span className="text-teal-400 font-semibold">
											Min Stake:
										</span>{" "}
										$10,000
									</div>
									<div>
										<span className="text-teal-400 font-semibold">
											Lock Period:
										</span>{" "}
										30 days
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{/* Staking Pool 1 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">
									ETH Staking
								</CardTitle>
								<Badge
									variant="secondary"
									className="bg-teal-500/20 text-teal-400"
								>
									Active
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">
									8.5%
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Total Staked
								</span>
								<span className="text-white">1,234.56 ETH</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Your Stake
								</span>
								<span className="text-white">0.00 ETH</span>
							</div>
							<Button className="w-full bg-teal-500 hover:bg-teal-600">
								Stake ETH
							</Button>
						</CardContent>
					</Card>

					{/* Staking Pool 2 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">
									USDC Staking
								</CardTitle>
								<Badge
									variant="secondary"
									className="bg-teal-500/20 text-teal-400"
								>
									Active
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">
									12.3%
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Total Staked
								</span>
								<span className="text-white">456,789 USDC</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Your Stake
								</span>
								<span className="text-white">0.00 USDC</span>
							</div>
							<Button className="w-full bg-teal-500 hover:bg-teal-600">
								Stake USDC
							</Button>
						</CardContent>
					</Card>

					{/* Staking Pool 3 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">
									TANGO Staking
								</CardTitle>
								<Badge
									variant="outline"
									className="text-gray-400 border-gray-600"
								>
									Coming Soon
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">
									15.0%
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Total Staked
								</span>
								<span className="text-white">-</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">
									Your Stake
								</span>
								<span className="text-white">-</span>
							</div>
							<Button disabled className="w-full">
								Coming Soon
							</Button>
						</CardContent>
					</Card>

					{/* Perp Trading Pool */}
					<Card className="bg-gradient-to-br from-teal-900/30 to-blue-900/30 border-teal-500/40">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">
									Perp Trading Pool
								</CardTitle>
								<Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40">
									Premium
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-teal-400 font-semibold">
									25-40%
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Min Stake</span>
								<span className="text-white">$10,000</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Strategy</span>
								<span className="text-white">Auto Trading</span>
							</div>
							<Button className="w-full bg-teal-500 hover:bg-teal-600">
								Contact Developer
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Your Staking Summary */}
				<div className="mt-12">
					<h2 className="text-xl font-bold text-white mb-6">
						Your Staking Summary
					</h2>
					<Card className="bg-slate-900 border-slate-800">
						<CardContent className="p-6">
							<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
								<div>
									<div className="text-gray-400 text-sm mb-1">
										Total Staked Value
									</div>
									<div className="text-2xl font-bold text-white">
										$0.00
									</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">
										Total Rewards Earned
									</div>
									<div className="text-2xl font-bold text-teal-400">
										$0.00
									</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">
										Average APY
									</div>
									<div className="text-2xl font-bold text-white">
										0.0%
									</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">
										Claimable Rewards
									</div>
									<div className="text-2xl font-bold text-green-400">
										$0.00
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
