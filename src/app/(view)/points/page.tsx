import { Gift, Star } from "lucide-react";
import { AuthGate } from "@/components/ui/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/hooks/useDashboard";
import { formatNumber } from "@/lib/dashboard-service";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Points - Lemon Markets",
	description: "Earn and redeem points for rewards",
};

function PointsContent() {
	const { pointsEarned } = useDashboard();

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Points</h1>
						<p className="text-muted-foreground text-xs">
							Earn points through trading and redeem for rewards
						</p>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Total Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{formatNumber(pointsEarned)}</div>
							<p className="text-sm text-muted-foreground">Lifetime points earned</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Available Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{formatNumber(pointsEarned)}</div>
							<p className="text-sm text-muted-foreground">Ready to redeem</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Points This Month</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{formatNumber(pointsEarned * 0.1)}</div>
							<p className="text-sm text-muted-foreground">+15% from last month</p>
						</CardContent>
					</Card>
				</div>{" "}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>How to Earn Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="flex items-start gap-3">
									<Star className="w-5 h-5 text-primary mt-0.5" />
									<div>
										<p className="font-medium">Trading Volume</p>
										<p className="text-sm text-muted-foreground">Earn 1 point per $100 traded</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Star className="w-5 h-5 text-primary mt-0.5" />
									<div>
										<p className="font-medium">Referral Program</p>
										<p className="text-sm text-muted-foreground">
											Earn 10% of your referrals' points
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Star className="w-5 h-5 text-primary mt-0.5" />
									<div>
										<p className="font-medium">Daily Login</p>
										<p className="text-sm text-muted-foreground">Earn 5 points per day</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Redeem Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
									<div className="flex items-center gap-3">
										<Gift className="w-5 h-5 text-primary" />
										<div>
											<p className="font-medium">$10 Trading Credit</p>
											<p className="text-sm text-muted-foreground">1000 points</p>
										</div>
									</div>
									<button
										type="button"
										className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
									>
										Redeem
									</button>
								</div>
								<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
									<div className="flex items-center gap-3">
										<Gift className="w-5 h-5 text-primary" />
										<div>
											<p className="font-medium">VIP Status</p>
											<p className="text-sm text-muted-foreground">5000 points</p>
										</div>
									</div>
									<button
										type="button"
										className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
									>
										Redeem
									</button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}

export default function PointsPage() {
	return (
		<AuthGate
			icon={Star}
			title="Connect Wallet to View Points"
			description="Connect your wallet to track your points, view your history, and redeem rewards."
		>
			<PointsContent />
		</AuthGate>
	);
}
