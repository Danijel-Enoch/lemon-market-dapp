"use client";

import { ReferralCodeSection } from "@app/components/dashboard/ReferralCodeSection";
import { ReferralStats } from "@app/components/dashboard/ReferralStats";
import { AuthGate } from "@app/components/ui/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card";
import { useDashboard } from "@app/hooks/useDashboard";
import { useReferral } from "@app/hooks/useReferral";
import { applyReferralCode } from "@app/lib/dashboard-service";
import type { Metadata } from "@app/lib/types";
import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";

export const metadata: Metadata = {
	title: "Referral - Lemon Markets",
	description: "Invite friends and earn rewards",
};

function ReferralContent() {
	const {
		referralCode,
		totalReferrals,
		referralEarnings,
		isLoading,
		generateReferralCode,
		refetch,
	} = useDashboard();
	const { getReferredByFromStorage } = useReferral();
	const { address } = useAccount();

	const [isGenerating, setIsGenerating] = useState(false);
	const [applyCode, setApplyCode] = useState("");
	const [_isApplying, setIsApplying] = useState(false);

	const handleGenerateCode = async () => {
		setIsGenerating(true);
		try {
			const code = await generateReferralCode();
			return code;
		} catch {
			return null;
		} finally {
			setIsGenerating(false);
		}
	};

	const _handleApplyReferralCode = async () => {
		if (!address) {
			toast.error("Please connect your wallet first");
			return;
		}
		if (!applyCode.trim()) {
			toast.error("Please enter a referral code");
			return;
		}

		setIsApplying(true);
		try {
			const result = await applyReferralCode(address, applyCode.trim());
			if (result.success) {
				toast.success("Referral code applied successfully! You've earned bonus points.");
				setApplyCode("");
				refetch?.();
			} else {
				toast.error(result.message || "Failed to apply referral code");
			}
		} catch (_error) {
			toast.error("Failed to apply referral code");
		} finally {
			setIsApplying(false);
		}
	};

	// Check if user came with a referral code
	const referredBy = getReferredByFromStorage();

	console.log("Referred by code:", referredBy);
	console.log("User address:", address);
	console.log("Referral code:", referralCode);

	return (
		<div className="min-h-screen w-full mt-8">
			<div className="w-full">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-bold text-foreground">Referral Program</h1>
						<p className="text-muted-foreground text-xs">
							Invite friends and earn rewards together
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
					<ReferralStats
						totalReferrals={totalReferrals}
						referralEarnings={referralEarnings}
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
											Get 10 points for each friend who joins!
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<UserPlus className="size-5" />
								Apply Referral Code
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<p className="text-sm text-muted-foreground">
									Were you referred by a friend? Enter their referral code below to give them bonus
									points!
								</p>
								{referredBy && (
									<div className="p-3 bg-primary/10 rounded-lg">
										<p className="text-sm text-primary">
											You were referred with code:{" "}
											<span className="font-mono font-bold">{referredBy}</span>
										</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

export default function ReferralPage() {
	return (
		<AuthGate
			icon={Users}
			title="Connect Wallet to View Referrals"
			description="Connect your wallet to access your referral code, track your earnings, and invite friends."
		>
			<ReferralContent />
		</AuthGate>
	);
}
