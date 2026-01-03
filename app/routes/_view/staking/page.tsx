import { Card, CardContent } from "@app/components/ui/card";
import type { Metadata } from "@app/lib/types";
import { Bell, Lock, Shield, Sparkles, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
	title: "Staking - Coming Soon | Lemon Markets",
	description: "Stake your tokens and earn rewards - Coming Soon",
};

export default function StakingPage() {
	return (
		<div className="min-h-screen w-full mt-8">
			<div className="w-full">
				{/* Hero Section */}
				<div className="flex flex-col items-center justify-center text-center py-16 md:py-24">
					{/* Animated Badge */}
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-pulse">
						<Sparkles className="w-4 h-4 text-primary" />
						<span className="text-sm font-medium text-primary">Coming Soon</span>
					</div>

					{/* Main Heading */}
					<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-linear-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
						Staking
					</h1>

					<p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12">
						We&apos;re building something amazing. Stake your tokens and earn passive income with
						our upcoming staking pools.
					</p>

					{/* Notification CTA */}
					<div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
						<div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-muted/50 border border-accent/20">
							<Bell className="w-5 h-5 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">Stay tuned for updates</span>
						</div>
					</div>

					{/* Decorative Glow */}
					<div className="relative w-full max-w-lg h-32 mb-8">
						<div className="absolute inset-0 bg-linear-to-r from-primary/20 via-primary/40 to-primary/20 blur-3xl rounded-full" />
						<div className="absolute inset-4 bg-linear-to-r from-transparent via-primary/30 to-transparent blur-2xl rounded-full animate-pulse" />
					</div>
				</div>

				{/* Upcoming Features */}
				<div className="mb-16">
					<h2 className="text-2xl font-semibold text-center mb-8">What&apos;s Coming</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<Card className="border-accent/20 bg-linear-to-br from-background to-muted/30 hover:border-primary/30 transition-colors">
							<CardContent className="pt-6">
								<div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
									<TrendingUp className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">High APY Rewards</h3>
								<p className="text-sm text-muted-foreground">
									Earn competitive yields on your staked tokens with our optimized reward
									distribution.
								</p>
							</CardContent>
						</Card>

						<Card className="border-accent/20 bg-linear-to-br from-background to-muted/30 hover:border-primary/30 transition-colors">
							<CardContent className="pt-6">
								<div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
									<Lock className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">Flexible Lock Periods</h3>
								<p className="text-sm text-muted-foreground">
									Choose your staking duration - from flexible withdrawals to boosted long-term
									rewards.
								</p>
							</CardContent>
						</Card>

						<Card className="border-accent/20 bg-linear-to-br from-background to-muted/30 hover:border-primary/30 transition-colors">
							<CardContent className="pt-6">
								<div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
									<Shield className="w-6 h-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">Secure & Audited</h3>
								<p className="text-sm text-muted-foreground">
									Smart contracts audited by leading security firms for your peace of mind.
								</p>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Stats Preview */}
				<Card className="border-accent/20 bg-linear-to-br from-muted/20 to-background">
					<CardContent className="py-8">
						<div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
							<div>
								<p className="text-3xl font-bold text-primary">--</p>
								<p className="text-sm text-muted-foreground mt-1">Total Staked</p>
							</div>
							<div>
								<p className="text-3xl font-bold text-primary">--</p>
								<p className="text-sm text-muted-foreground mt-1">Stakers</p>
							</div>
							<div>
								<p className="text-3xl font-bold text-primary">--</p>
								<p className="text-sm text-muted-foreground mt-1">APY Range</p>
							</div>
							<div>
								<p className="text-3xl font-bold text-primary">--</p>
								<p className="text-sm text-muted-foreground mt-1">Total Rewards</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
