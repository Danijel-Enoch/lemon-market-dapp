import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
	createReferralCode,
	type DashboardStats,
	getUserFeesEarned,
	getUserLeaderboardRank,
	getUserPoints,
	getUserReferralCode,
	getUserReferralStats,
	getUserTradingVolume,
} from "@/lib/dashboard-service";

export function useDashboard() {
	const { address, isConnected } = useAccount();
	const [stats, setStats] = useState<DashboardStats>({
		pointsEarned: 0,
		feesEarned: 0,
		tradingVolume: 0,
		referralCode: null,
		totalReferrals: 0,
		referralEarnings: 0,
		leaderboardRank: 0,
		isLoading: true,
		error: null,
	});

	const fetchDashboardData = async () => {
		if (!isConnected || !address) {
			setStats((prev) => ({ ...prev, isLoading: false }));
			return;
		}

		try {
			setStats((prev) => ({ ...prev, isLoading: true, error: null }));

			const [referralCode, points, feesEarned, volume, referralStats, rank] = await Promise.all([
				getUserReferralCode(address),
				getUserPoints(address),
				getUserFeesEarned(address),
				getUserTradingVolume(address),
				getUserReferralStats(address),
				getUserLeaderboardRank(address),
			]);

			setStats({
				pointsEarned: points,
				feesEarned: feesEarned,
				tradingVolume: volume,
				referralCode: referralCode,
				totalReferrals: referralStats.totalReferrals,
				referralEarnings: referralStats.referralEarnings,
				leaderboardRank: rank,
				isLoading: false,
				error: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to fetch dashboard data";
			setStats((prev) => ({
				...prev,
				isLoading: false,
				error: errorMessage,
			}));
		}
	};

	const generateReferralCode = async () => {
		if (!isConnected || !address) {
			setStats((prev) => ({ ...prev, error: "Wallet not connected" }));
			return null;
		}

		try {
			setStats((prev) => ({ ...prev, error: null }));
			const code = await createReferralCode(address);
			if (code) {
				setStats((prev) => ({ ...prev, referralCode: code }));
			}
			return code;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to generate referral code";
			setStats((prev) => ({ ...prev, error: errorMessage }));
			return null;
		}
	};

	useEffect(() => {
		fetchDashboardData();
		// Refresh data every 30 seconds
		const interval = setInterval(fetchDashboardData, 30000);
		return () => clearInterval(interval);
	}, [fetchDashboardData]);

	return {
		...stats,
		refetch: fetchDashboardData,
		generateReferralCode,
		isWalletConnected: isConnected,
		walletAddress: address,
	};
}
