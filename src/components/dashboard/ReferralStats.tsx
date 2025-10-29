"use client";

import { Users, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/dashboard-service";

interface ReferralStatsProps {
	totalReferrals: number;
	referralEarnings: number;
	isLoading?: boolean;
}

export function ReferralStats({
	totalReferrals,
	referralEarnings,
	isLoading = false
}: ReferralStatsProps) {
	return (
		<Card className="border-accent/20">
			<CardHeader className="border-b border-accent/10 pb-4">
				<CardTitle className="text-base font-semibold">
					Referral Overview
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-6">
				<div className="grid grid-cols-2 gap-6">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Users className="size-4 text-primary" />
							<span className="text-xs text-muted-foreground">
								Total Referrals
							</span>
						</div>
						{isLoading ? (
							<div className="h-8 w-12 animate-pulse rounded bg-accent/20" />
						) : (
							<div className="text-2xl font-bold">
								{totalReferrals}
							</div>
						)}
					</div>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Gift className="size-4 text-primary" />
							<span className="text-xs text-muted-foreground">
								Referral Earnings
							</span>
						</div>
						{isLoading ? (
							<div className="h-8 w-20 animate-pulse rounded bg-accent/20" />
						) : (
							<div className="text-2xl font-bold">
								{formatCurrency(referralEarnings)}
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
