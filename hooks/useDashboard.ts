import { useEffect, useMemo, useRef } from "react";
import { useAsyncFn } from "react-use";
import { useAccount } from "wagmi";
import {
	createReferralCode,
	getUserFeesEarned,
	getUserLeaderboardRank,
	getUserPoints,
	getUserReferralCode,
	getUserReferralStats,
	getUserTradingVolume,
} from "@/lib/dashboard-service";

export function useDashboard() {
	const { address, isConnected } = useAccount();
	const lastFetchTimeRef = useRef<number>(0);

	// Cache data for 30 seconds to prevent unnecessary refetches
	const CACHE_DURATION = 30000;

	const [{ loading: isLoading, error: fetchError, value: dashboardData }, fetchDashboardData] =
		useAsyncFn(
			async (force = false) => {
				if (!isConnected || !address) {
					return null;
				}

				// Check if we need to fetch (respect cache unless forced)
				const now = Date.now();
				if (!force && now - lastFetchTimeRef.current < CACHE_DURATION) {
					return null;
				}

				// Use Promise.allSettled to handle partial failures gracefully
				const results = await Promise.allSettled([
					getUserReferralCode(address),
					getUserPoints(address),
					getUserFeesEarned(address),
					getUserTradingVolume(address),
					getUserReferralStats(address),
					getUserLeaderboardRank(address),
				]);

				// Extract successful results with fallback values
				const [
					referralCodeResult,
					_pointsResult,
					feesEarnedResult,
					volumeResult,
					referralStatsResult,
					rankResult,
				] = results;
				const referralCode =
					referralCodeResult.status === "fulfilled" ? referralCodeResult.value : null;
				const feesEarned = feesEarnedResult.status === "fulfilled" ? feesEarnedResult.value : 0;
				const volume = volumeResult.status === "fulfilled" ? volumeResult.value : 0;
				const referralStats =
					referralStatsResult.status === "fulfilled"
						? referralStatsResult.value
						: { totalReferrals: 0, referralEarnings: 0, points: 0 };
				const rank = rankResult.status === "fulfilled" ? rankResult.value : 0;

				// Update last fetch time
				lastFetchTimeRef.current = now;

				return {
					pointsEarned: referralStats.points,
					feesEarned,
					tradingVolume: volume,
					referralCode,
					totalReferrals: referralStats.totalReferrals,
					referralEarnings: referralStats.referralEarnings,
					leaderboardRank: rank,
				};
			},
			[address, isConnected],
		);

	const [{ value: generatedCode, error: generateError }, generateReferralCode] =
		useAsyncFn(async () => {
			if (!isConnected || !address) {
				throw new Error("Wallet not connected");
			}

			const code = await createReferralCode(address);
			if (!code) {
				throw new Error("Failed to generate referral code");
			}

			return code;
		}, [address, isConnected]);

	// Compute stats from fetched data with memoization
	const stats = useMemo(() => {
		const data = dashboardData || {
			pointsEarned: 0,
			feesEarned: 0,
			tradingVolume: 0,
			referralCode: generatedCode || null,
			totalReferrals: 0,
			referralEarnings: 0,
			leaderboardRank: 0,
		};

		// Update referral code if one was generated
		if (generatedCode) {
			data.referralCode = generatedCode;
		}

		return data;
	}, [dashboardData, generatedCode]);

	const error = fetchError?.message || generateError?.message || null;

	useEffect(() => {
		fetchDashboardData();
		// Refresh data every 60 seconds (increased from 30 to reduce load)
		const interval = setInterval(() => fetchDashboardData(), 60000);
		return () => clearInterval(interval);
	}, [fetchDashboardData]);

	return {
		...stats,
		isLoading,
		error,
		refetch: () => fetchDashboardData(true), // Force refresh when manually triggered
		generateReferralCode: async () => {
			const result = await generateReferralCode();
			return result || null;
		},
		isWalletConnected: isConnected,
		walletAddress: address,
	};
}
