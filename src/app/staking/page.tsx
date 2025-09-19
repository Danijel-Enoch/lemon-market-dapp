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
					<h1 className="text-3xl font-bold text-white mb-2">Staking</h1>
					<p className="text-gray-400">Stake your tokens to earn rewards</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{/* Staking Pool 1 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">ETH Staking</CardTitle>
								<Badge variant="secondary" className="bg-teal-500/20 text-teal-400">
									Active
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">8.5%</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Total Staked</span>
								<span className="text-white">1,234.56 ETH</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Your Stake</span>
								<span className="text-white">0.00 ETH</span>
							</div>
							<Button className="w-full bg-teal-500 hover:bg-teal-600">Stake ETH</Button>
						</CardContent>
					</Card>

					{/* Staking Pool 2 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">USDC Staking</CardTitle>
								<Badge variant="secondary" className="bg-teal-500/20 text-teal-400">
									Active
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">12.3%</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Total Staked</span>
								<span className="text-white">456,789 USDC</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Your Stake</span>
								<span className="text-white">0.00 USDC</span>
							</div>
							<Button className="w-full bg-teal-500 hover:bg-teal-600">Stake USDC</Button>
						</CardContent>
					</Card>

					{/* Staking Pool 3 */}
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="text-white">TANGO Staking</CardTitle>
								<Badge variant="outline" className="text-gray-400 border-gray-600">
									Coming Soon
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">APY</span>
								<span className="text-white font-semibold">15.0%</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Total Staked</span>
								<span className="text-white">-</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-gray-400">Your Stake</span>
								<span className="text-white">-</span>
							</div>
							<Button disabled className="w-full">
								Coming Soon
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Your Staking Summary */}
				<div className="mt-12">
					<h2 className="text-xl font-bold text-white mb-6">Your Staking Summary</h2>
					<Card className="bg-slate-900 border-slate-800">
						<CardContent className="p-6">
							<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
								<div>
									<div className="text-gray-400 text-sm mb-1">Total Staked Value</div>
									<div className="text-2xl font-bold text-white">$0.00</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">Total Rewards Earned</div>
									<div className="text-2xl font-bold text-teal-400">$0.00</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">Average APY</div>
									<div className="text-2xl font-bold text-white">0.0%</div>
								</div>
								<div>
									<div className="text-gray-400 text-sm mb-1">Claimable Rewards</div>
									<div className="text-2xl font-bold text-green-400">$0.00</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
