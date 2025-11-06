import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
	getUserReferralCode,
	createReferralCode,
	getUserPoints,
	getUserFeesEarned,
	getUserTradingVolume,
	getUserReferralStats,
	getUserLeaderboardRank,
	type DashboardStats
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
		error: null
	});
	const [lastFetchTime, setLastFetchTime] = useState<number>(0);

	// Cache data for 30 seconds to prevent unnecessary refetches
	const CACHE_DURATION = 30000;

	const fetchDashboardData = async (force = false) => {
		if (!isConnected || !address) {
			setStats((prev) => ({ ...prev, isLoading: false }));
			return;
		}

		// Check if we need to fetch (respect cache unless forced)
		const now = Date.now();
		if (!force && now - lastFetchTime < CACHE_DURATION) {
			return;
		}

		try {
			setStats((prev) => ({ ...prev, isLoading: true, error: null }));

			// Use Promise.allSettled to handle partial failures gracefully
			const results = await Promise.allSettled([
				getUserReferralCode(address),
				getUserPoints(address),
				getUserFeesEarned(address),
				getUserTradingVolume(address),
				getUserReferralStats(address),
				getUserLeaderboardRank(address)
			]);

			// Extract successful results with fallback values
			const [
				referralCodeResult,
				pointsResult,
				feesEarnedResult,
				volumeResult,
				referralStatsResult,
				rankResult
			] = results;

			const referralCode =
				referralCodeResult.status === "fulfilled"
					? referralCodeResult.value
					: null;
			const points =
				pointsResult.status === "fulfilled" ? pointsResult.value : 0;
			const feesEarned =
				feesEarnedResult.status === "fulfilled"
					? feesEarnedResult.value
					: 0;
			const volume =
				volumeResult.status === "fulfilled" ? volumeResult.value : 0;
			const referralStats =
				referralStatsResult.status === "fulfilled"
					? referralStatsResult.value
					: { totalReferrals: 0, referralEarnings: 0 };
			const rank =
				rankResult.status === "fulfilled" ? rankResult.value : 0;

			setStats({
				pointsEarned: points,
				feesEarned: feesEarned,
				tradingVolume: volume,
				referralCode: referralCode,
				totalReferrals: referralStats.totalReferrals,
				referralEarnings: referralStats.referralEarnings,
				leaderboardRank: rank,
				isLoading: false,
				error: null
			});

			// Update last fetch time
			setLastFetchTime(now);

			// Check if any requests failed and log for debugging
			const failedRequests = results.filter(
				(result) => result.status === "rejected"
			);
			if (failedRequests.length > 0) {
				console.warn(
					`${failedRequests.length} dashboard API requests failed, but showing available data`
				);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to fetch dashboard data";
			setStats((prev) => ({
				...prev,
				isLoading: false,
				error: errorMessage
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
				error instanceof Error
					? error.message
					: "Failed to generate referral code";
			setStats((prev) => ({ ...prev, error: errorMessage }));
			return null;
		}
	};

	useEffect(() => {
		fetchDashboardData();
		// Refresh data every 60 seconds (increased from 30 to reduce load)
		const interval = setInterval(fetchDashboardData, 60000);
		return () => clearInterval(interval);
	}, [isConnected, address]);

	return {
		...stats,
		refetch: () => fetchDashboardData(true), // Force refresh when manually triggered
		generateReferralCode,
		isWalletConnected: isConnected,
		walletAddress: address
	};
}
