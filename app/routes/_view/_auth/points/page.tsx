import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card";
import { useDashboard } from "@app/hooks/useDashboard";
import { formatNumber } from "@app/lib/dashboard-service";
import type { Metadata } from "@app/lib/types";
import { Star } from "lucide-react";

export const metadata: Metadata = {
	title: "Points - Lemon Markets",
	description: "Earn and redeem points for rewards",
};

export const handle = {
	authTitle: "Connect Wallet to View Points",
	authDescription:
		"Connect your wallet to track your points, view your history, and redeem rewards.",
	authIcon: Star,
};

export default function PointsPage() {
	const { pointsBreakdown } = useDashboard();

	return (
		<div className="min-h-screen w-full mt-8">
			<div className="w-full">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-bold text-foreground">Points</h1>
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
							<div className="text-3xl font-bold">{formatNumber(pointsBreakdown.total)}</div>
							<p className="text-sm text-muted-foreground">Lifetime points earned</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Referral Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								{formatNumber(pointsBreakdown?.referral || 0)}
							</div>
							<p className="text-sm text-muted-foreground">Earned from invites</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Trading Points</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								{formatNumber(pointsBreakdown?.trading || 0)}
							</div>
							<p className="text-sm text-muted-foreground">Earned from trading volume</p>
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
				</div>
			</div>
		</div>
	);
}
