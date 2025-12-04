import { Users } from "lucide-react";
import { useState } from "react";
import { ReferralCodeSection } from "@/components/dashboard/ReferralCodeSection";
import { ReferralStats } from "@/components/dashboard/ReferralStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/hooks/useDashboard";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Referral - Lemon Markets",
	description: "Invite friends and earn rewards",
};

export default function ReferralPage() {
	const {
		referralCode,
		totalReferrals,
		referralEarnings,
		isLoading,
		generateReferralCode,
		isWalletConnected,
	} = useDashboard();
	
	const [isGenerating, setIsGenerating] = useState(false);

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

	if (!isWalletConnected) {
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

					<Card className="border-accent/20">
						<CardContent className="flex flex-col items-center justify-center py-12">
							<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
								<Users className="w-6 h-6 text-primary" />
							</div>
							<h2 className="text-xl font-semibold mb-2">Connect Wallet to View Referrals</h2>
							<p className="text-muted-foreground text-center max-w-md mb-6">
								Connect your wallet to access your referral code, track your earnings, and invite friends.
							</p>
							<div className="flex gap-4">
								{/* The connect button is usually in the header, but we can add a hint or just let them use the header */}
								<p className="text-sm text-primary">Please connect your wallet using the button in the top right.</p>
							</div>
						</CardContent>
					</Card>
				</main>
			</div>
		);
	}

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
