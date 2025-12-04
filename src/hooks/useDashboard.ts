import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useAsyncFn from "react-use/lib/useAsyncFn";
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

	const {
		data: dashboardData,
		isLoading,
		error: fetchError,
		refetch,
	} = useQuery({
		queryKey: ["dashboard", address],
		queryFn: async () => {
			if (!isConnected || !address) {
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
		enabled: !!isConnected && !!address,
		refetchInterval: 60000, // Refresh data every 60 seconds
	});

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

	return {
		...stats,
		isLoading,
		error,
		refetch,
		generateReferralCode: async () => {
			const result = await generateReferralCode();
			return result || null;
		},
		isWalletConnected: isConnected,
		walletAddress: address,
	};
}
