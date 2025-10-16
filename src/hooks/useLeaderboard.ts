import { useState, useEffect } from "react";

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
		refreshInterval = 30000 // 30 seconds
	} = options;

	const [data, setData] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchLeaderboard = async () => {
		try {
			setLoading(true);
			setError(null);

			const params = new URLSearchParams({
				sortBy,
				order,
				limit: limit.toString()
			});

			const response = await fetch(`/api/leaderboard?${params}`);

			if (!response.ok) {
				throw new Error(
					`Failed to fetch leaderboard: ${response.statusText}`
				);
			}

			const result: LeaderboardResponse = await response.json();

			if (result.success) {
				setData(result.data);
			} else {
				throw new Error("Failed to fetch leaderboard data");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			console.error("Error fetching leaderboard:", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchLeaderboard();
	}, [sortBy, order, limit]);

	useEffect(() => {
		if (autoRefresh) {
			const interval = setInterval(fetchLeaderboard, refreshInterval);
			return () => clearInterval(interval);
		}
	}, [autoRefresh, refreshInterval]);

	const refresh = () => {
		fetchLeaderboard();
	};

	const totalTraders = data.length;
	const totalTrades = data.reduce((sum, entry) => sum + entry.totalTrades, 0);
	const avgPointsPerTrade =
		data.length > 0
			? (
					data.reduce(
						(sum, entry) => sum + parseFloat(entry.pointsPerTrade),
						0
					) / data.length
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
			activeTiers
		}
	};
}
