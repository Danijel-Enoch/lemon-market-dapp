import { useEffect } from "react";
import { useAsyncFn } from "react-use";

interface LeaderboardEntry {
	id: string;
	rank: number;
	trader: string;
	totalPoints: string;
	totalPointsFormatted: string;
	totalTrades: number;
	pointsPerTrade: string;
	pointsPerTradeFormatted: string;
	currentTier: string;
	firstTradeTimestamp: string;
	lastTradeTimestamp: string;
	lastPointsAwarded: string;
	lastPointsAwardedFormatted: string;
	bronzeTierAt: string | null;
	silverTierAt: string | null;
	goldTierAt: string | null;
	lastTransactionHash: string;
	lastBlockNumber: number;
	lastBlockTimestamp: string;
}

interface LeaderboardResponse {
	success: boolean;
	data: LeaderboardEntry[];
	total: number;
	limit: number | null;
	sortBy: string;
	order: string;
}

interface UseLeaderboardOptions {
	sortBy?: string;
	order?: string;
	limit?: number;
	autoRefresh?: boolean;
	refreshInterval?: number;
}

export function useLeaderboard(options: UseLeaderboardOptions = {}) {
	const {
		sortBy = "totalPoints",
		order = "desc",
		limit = 50,
		autoRefresh = false,
		refreshInterval = 30000, // 30 seconds
	} = options;

	const [{ loading, error: fetchError, value: leaderboardData }, fetchLeaderboard] =
		useAsyncFn(async () => {
			const params = new URLSearchParams({
				sortBy,
				order,
				limit: limit.toString(),
			});

			const response = await fetch(`/api/leaderboard?${params}`);

			if (!response.ok) {
				throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
			}

			const result: LeaderboardResponse = await response.json();

			if (result.success) {
				return result.data;
			}
			throw new Error("Failed to fetch leaderboard data");
		}, [sortBy, order, limit]);

	const error = fetchError ? fetchError.message : null;
	const data = leaderboardData || [];

	useEffect(() => {
		fetchLeaderboard();
	}, [fetchLeaderboard]);

	useEffect(() => {
		if (autoRefresh) {
			const interval = setInterval(fetchLeaderboard, refreshInterval);
			return () => clearInterval(interval);
		}
	}, [autoRefresh, refreshInterval, fetchLeaderboard]);

	const refresh = () => {
		fetchLeaderboard();
	};

	const totalTraders = data.length;
	const totalTrades = data.reduce((sum, entry) => sum + entry.totalTrades, 0);
	const avgPointsPerTrade =
		data.length > 0
			? (
					data.reduce((sum, entry) => sum + parseFloat(entry.pointsPerTrade), 0) / data.length
				).toFixed(0)
			: "0";
	const activeTiers = new Set(data.map((entry) => entry.currentTier)).size;

	return {
		data,
		loading,
		error,
		refresh,
		stats: {
			totalTraders,
			totalTrades,
			avgPointsPerTrade,
			activeTiers,
		},
	};
}
