"use client";

import {
	TrendingUp,
	Zap,
	Volume2,
	Trophy,
	ArrowUpRight,
	ArrowDownLeft
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ReferralCodeSection } from "@/components/dashboard/ReferralCodeSection";
import { ReferralStats } from "@/components/dashboard/ReferralStats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { useDashboard } from "@/hooks/useDashboard";
import { formatCurrency, formatNumber } from "@/lib/dashboard-service";

function DashboardContent() {
	const {
		pointsEarned,
		feesEarned,
		tradingVolume,
		referralCode,
		totalReferrals,
		referralEarnings,
		leaderboardRank,
		isLoading,
		error,
		isWalletConnected,
		generateReferralCode,
		refetch
	} = useDashboard();

	const [isGeneratingCode, setIsGeneratingCode] = useState(false);

	const handleGenerateCode = async (): Promise<string | null> => {
		setIsGeneratingCode(true);
		try {
			return await generateReferralCode();
		} finally {
			setIsGeneratingCode(false);
		}
	};

	if (!isWalletConnected) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
				<div className="text-center">
					<h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
					<p className="text-muted-foreground">
						Connect your wallet to view your trading statistics and
						referral rewards
					</p>
				</div>
				<ConnectWallet />
			</div>
		);
	}

	return (
		<div className="space-y-8 pb-12">
			{/* Header */}
			<div className="space-y-2">
				<h1 className="text-3xl font-bold">Dashboard</h1>
				<p className="text-muted-foreground">
					Track your trading performance and referral rewards
				</p>
			</div>

			{/* Error Message */}
			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
					<p className="font-medium">Error loading dashboard</p>
					<p className="mt-1">{error}</p>
					<Button
						onClick={refetch}
						variant="outline"
						size="sm"
						className="mt-3"
					>
						Retry
					</Button>
				</div>
			)}

			{/* Main Stats Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					title="Points Earned"
					value={formatNumber(pointsEarned)}
					icon={TrendingUp}
					isLoading={isLoading}
					change={pointsEarned > 0 ? "↑ Active" : "No points yet"}
					changeType={pointsEarned > 0 ? "positive" : "neutral"}
				/>
				<StatCard
					title="Fees Earned"
					value={formatCurrency(feesEarned)}
					icon={Zap}
					isLoading={isLoading}
					change={feesEarned > 0 ? "From trading" : "Start trading"}
					changeType={feesEarned > 0 ? "positive" : "neutral"}
				/>
				<StatCard
					title="Trading Volume"
					value={formatCurrency(tradingVolume)}
					icon={Volume2}
					isLoading={isLoading}
					change="Lifetime volume"
					changeType="neutral"
				/>
				<StatCard
					title="Leaderboard Rank"
					value={leaderboardRank > 0 ? `#${leaderboardRank}` : "—"}
					icon={Trophy}
					isLoading={isLoading}
					change={leaderboardRank > 0 ? "Your rank" : "No rank yet"}
					changeType="neutral"
				/>
			</div>

			{/* Referral Section */}
			<div className="grid gap-6 lg:grid-cols-2">
				<ReferralCodeSection
					referralCode={referralCode}
					isGenerating={isGeneratingCode}
					onGenerate={handleGenerateCode}
				/>
				<ReferralStats
					totalReferrals={totalReferrals}
					referralEarnings={referralEarnings}
					isLoading={isLoading}
				/>
			</div>

			{/* Additional Info Cards */}
			<div className="grid gap-6 lg:grid-cols-2">
				{/* Trading Stats */}
				<Card className="border-accent/20">
					<CardHeader className="border-b border-accent/10 pb-4">
						<CardTitle className="text-base font-semibold">
							Quick Stats
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-4">
							<div className="flex items-center justify-between rounded-lg bg-accent/50 p-3">
								<div className="flex items-center gap-2">
									<ArrowUpRight className="size-4 text-green-500" />
									<span className="text-sm">
										Total Points
									</span>
								</div>
								<span className="font-semibold">
									{formatNumber(pointsEarned)}
								</span>
							</div>
							<div className="flex items-center justify-between rounded-lg bg-accent/50 p-3">
								<div className="flex items-center gap-2">
									<Zap className="size-4 text-yellow-500" />
									<span className="text-sm">
										Protocol Fees
									</span>
								</div>
								<span className="font-semibold">
									{formatCurrency(feesEarned)}
								</span>
							</div>
							<div className="flex items-center justify-between rounded-lg bg-accent/50 p-3">
								<div className="flex items-center gap-2">
									<Volume2 className="size-4 text-blue-500" />
									<span className="text-sm">
										Volume Traded
									</span>
								</div>
								<span className="font-semibold">
									{formatCurrency(tradingVolume)}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Referral Benefits Info */}
				<Card className="border-accent/20">
					<CardHeader className="border-b border-accent/10 pb-4">
						<CardTitle className="text-base font-semibold">
							How Referrals Work
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6">
						<ul className="space-y-3 text-sm">
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>
									<strong>Share your code:</strong> Give your
									unique referral code to friends
								</span>
							</li>
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>
									<strong>They sign up:</strong> Friends use
									your code to create an account
								</span>
							</li>
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>
									<strong>You earn rewards:</strong> Get a
									percentage of their trading fees
								</span>
							</li>
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>
									<strong>No limits:</strong> Earn unlimited
									rewards from unlimited referrals
								</span>
							</li>
						</ul>
					</CardContent>
				</Card>
			</div>

			{/* CTA Section */}
			<Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
				<CardContent className="pt-8">
					<div className="space-y-4 text-center">
						<div>
							<h3 className="text-xl font-bold">
								Ready to start earning?
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								Share your referral code and start earning
								rewards today
							</p>
						</div>
						{referralCode && (
							<Button className="gap-2">
								<TrendingUp className="size-4" />
								Start Trading Now
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function DashboardPage() {
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				<DashboardContent />
			</div>
		</div>
	);
}
