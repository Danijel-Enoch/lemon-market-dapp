import { Clock, DollarSign, Lock, Shield, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { AuthGate } from "@/components/ui/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Staking - Lemon Markets",
	description: "Stake your tokens and earn rewards",
};

function StakingContent() {
	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Staking</h1>
						<p className="text-muted-foreground text-xs">
							Stake your tokens and earn passive income
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Staked</CardTitle>
							<Lock className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$125,430</div>
							<p className="text-xs text-muted-foreground">Across all pools</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Your Stake</CardTitle>
							<DollarSign className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$5,240</div>
							<p className="text-xs text-muted-foreground">2 active positions</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">24h Rewards</CardTitle>
							<TrendingUp className="h-4 w-4 text-green-500" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-green-500">$12.45</div>
							<p className="text-xs text-muted-foreground">+5.2% APY</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Rewards</CardTitle>
							<Sparkles className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$1,234</div>
							<p className="text-xs text-muted-foreground">Lifetime earnings</p>
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Staking Pools</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{[
									{ token: "LEMON", apy: "12.5%", tvl: "$50K", lockPeriod: "30 days" },
									{ token: "USDC", apy: "8.3%", tvl: "$100K", lockPeriod: "Flexible" },
									{ token: "ETH", apy: "10.2%", tvl: "$75K", lockPeriod: "90 days" },
								].map((pool) => (
									<div
										key={pool.token}
										className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
									>
										<div>
											<p className="font-medium">{pool.token} Pool</p>
											<p className="text-sm text-muted-foreground">
												TVL: {pool.tvl} • {pool.lockPeriod}
											</p>
										</div>
										<div className="text-right">
											<p className="font-medium text-green-500">{pool.apy} APY</p>
											<button
												type="button"
												className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
											>
												Stake
											</button>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Positions</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="p-4 bg-muted/50 rounded-lg">
									<div className="flex items-center justify-between mb-2">
										<p className="font-medium">LEMON Staking</p>
										<span className="text-sm text-green-500">Active</span>
									</div>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<p className="text-muted-foreground">Staked</p>
											<p className="font-medium">2,500 LEMON</p>
										</div>
										<div>
											<p className="text-muted-foreground">Rewards</p>
											<p className="font-medium text-green-500">$45.67</p>
										</div>
									</div>
									<div className="flex items-center gap-2 mt-3">
										<Clock className="w-4 h-4 text-muted-foreground" />
										<span className="text-sm text-muted-foreground">25 days remaining</span>
									</div>
								</div>

								<div className="p-4 bg-muted/50 rounded-lg">
									<div className="flex items-center justify-between mb-2">
										<p className="font-medium">USDC Staking</p>
										<span className="text-sm text-green-500">Active</span>
									</div>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<p className="text-muted-foreground">Staked</p>
											<p className="font-medium">2,740 USDC</p>
										</div>
										<div>
											<p className="text-muted-foreground">Rewards</p>
											<p className="font-medium text-green-500">$23.45</p>
										</div>
									</div>
									<div className="flex items-center gap-2 mt-3">
										<Clock className="w-4 h-4 text-muted-foreground" />
										<span className="text-sm text-muted-foreground">Flexible</span>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<Card className="border-accent/20">
					<CardHeader>
						<CardTitle>Staking Benefits</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="text-center">
								<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
									<TrendingUp className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-medium mb-2">Earn Passive Income</h3>
								<p className="text-sm text-muted-foreground">
									Generate rewards automatically while holding your tokens
								</p>
							</div>

							<div className="text-center">
								<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
									<Shield className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-medium mb-2">Secure & Transparent</h3>
								<p className="text-sm text-muted-foreground">
									Smart contract-based staking with full transparency
								</p>
							</div>

							<div className="text-center">
								<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
									<Sparkles className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-medium mb-2">Boost Your Rewards</h3>
								<p className="text-sm text-muted-foreground">
									Increased rewards for longer lock periods
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}

export default function StakingPage() {
	return (
		<AuthGate
			icon={Wallet}
			title="Connect Wallet to View Staking"
			description="Connect your wallet to stake your tokens and earn rewards."
		>
			<StakingContent />
		</AuthGate>
	);
}
