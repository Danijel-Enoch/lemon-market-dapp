"use client";

import { useEffect, useState } from "react";
import { ReferralCodeSection } from "@/components/dashboard/ReferralCodeSection";
import { ReferralStats } from "@/components/dashboard/ReferralStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPositions } from "@/hooks/useUserPositions";
import {
	createReferralCode,
	getUserReferralCode,
	getUserReferralStats,
} from "@/lib/dashboard-service";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Referral - Lemon Markets",
	description: "Invite friends and earn rewards",
};

export default function ReferralPage() {
	const { address } = useUserPositions();
	const [referralCode, setReferralCode] = useState<string | null>(null);
	const [stats, setStats] = useState({ totalReferrals: 0, referralEarnings: 0, points: 0 });
	const [isLoading, setIsLoading] = useState(true);
	const [isGenerating, setIsGenerating] = useState(false);

	useEffect(() => {
		if (!address) return;

		const loadReferralData = async () => {
			try {
				const [code, statsData] = await Promise.all([
					getUserReferralCode(address),
					getUserReferralStats(address),
				]);
				setReferralCode(code);
				setStats(statsData);
			} catch (error) {
				console.error("Failed to load referral data:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadReferralData();
	}, [address]);

	const handleGenerateCode = async () => {
		if (!address) return null;
		setIsGenerating(true);
		try {
			const code = await createReferralCode(address);
			if (code) {
				setReferralCode(code);
			}
			return code;
		} catch (error) {
			console.error("Failed to generate referral code:", error);
			return null;
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Referral Program</h1>
						<p className="text-muted-foreground text-xs">
							Invite friends and earn rewards together
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
					<ReferralStats
						totalReferrals={stats.totalReferrals}
						referralEarnings={stats.referralEarnings}
						isLoading={isLoading}
					/>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>How It Works</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="flex items-start gap-3">
									<div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium text-primary">
										1
									</div>
									<div>
										<p className="font-medium">Share Your Code</p>
										<p className="text-sm text-muted-foreground">
											Get your unique referral code or link
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium text-primary">
										2
									</div>
									<div>
										<p className="font-medium">Friends Join</p>
										<p className="text-sm text-muted-foreground">
											Your friends sign up using your code
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium text-primary">
										3
									</div>
									<div>
										<p className="font-medium">Earn Rewards</p>
										<p className="text-sm text-muted-foreground">
											Get a percentage of their trading fees
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<Card className="border-accent/20">
					<CardHeader>
						<CardTitle>Your Referral Code</CardTitle>
					</CardHeader>
					<CardContent>
						<ReferralCodeSection
							referralCode={referralCode}
							isGenerating={isGenerating}
							onGenerate={handleGenerateCode}
						/>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
