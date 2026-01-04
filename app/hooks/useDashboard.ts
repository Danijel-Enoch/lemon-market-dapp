import {
	createReferralCode,
	getUserAggregatedPoints,
	getUserReferralStats,
} from "@app/lib/dashboard-service";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAsyncCallback } from "@app/hooks/useAsyncCallback";
import { useConnection } from "wagmi";

export function useDashboard() {
	const { address, isConnected } = useConnection();

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
				getUserReferralStats(address),
				getUserAggregatedPoints(address),
			]);

			// Extract successful results with fallback values
			const [referralStatsResult, aggregatedPointsResult] = results;

			const referralStats =
				referralStatsResult.status === "fulfilled"
					? referralStatsResult.value
					: {
							totalReferrals: 0,
							referralEarnings: 0,
							points: 0,
							referralCode: null,
						};

			const aggregatedPoints =
				aggregatedPointsResult.status === "fulfilled"
					? aggregatedPointsResult.value
					: {
							referral: 0,
							trading: 0,
							total: 0,
						};

			// Get referral code from stats response
			const referralCode = referralStats?.referralCode || null;

			// Prefer aggregated total points, fallback to referral stats points if aggregated is 0 (and strict check to ensure we don't overwrite with 0 if referral stats has something, though aggregated should be more comprehensive)
			const pointsEarned = aggregatedPoints.total || referralStats.points;

			return {
				pointsEarned,
				pointsBreakdown: aggregatedPoints,
				feesEarned: 0,
				tradingVolume: 0,
				referralCode,
				totalReferrals: referralStats.totalReferrals,
				referralEarnings: referralStats.referralEarnings,
				leaderboardRank: 0,
			};
		},
		enabled: !!isConnected && !!address,
		refetchInterval: 60000, // Refresh data every 60 seconds
	});

	const [{ value: generatedCode, error: generateError }, generateReferralCode] =
		useAsyncCallback(async () => {
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
			pointsBreakdown: { referral: 0, trading: 0, total: 0 },
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
			if (result) {
				// Refetch to update all stats after generating a new code
				refetch();
			}
			return result || null;
		},
		isWalletConnected: isConnected,
		walletAddress: address,
	};
}
