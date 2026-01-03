import { betterFetch } from "@better-fetch/fetch";

export interface LeaderboardEntry {
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

export interface ApiLeaderboardEntry {
	address: string;
	points: string;
	rank: number;
}

export interface ApiLeaderboardResponse {
	success: boolean;
	data: ApiLeaderboardEntry[];
}

const BASE_URL = "https://api.degenoptions.xyz";

export async function fetchLeaderboardData(params: {
	limit: number;
	offset: number;
	page: number;
}): Promise<LeaderboardEntry[]> {
	const { limit, offset, page } = params;

	try {
		const { data, error } = await betterFetch<ApiLeaderboardResponse>(
			`${BASE_URL}/leaderboard?limit=${limit}&offset=${offset}&page=${page}`,
			{
				method: "GET",
			},
		);

		if (error || !data || !data.success) {
			throw new Error("Failed to fetch leaderboard");
		}

		return data.data.map((entry) => {
			const pointsNum = Number(entry.points) / 1e6;
			const tier = entry.rank <= 3 ? "Gold" : entry.rank <= 10 ? "Silver" : "Bronze";

			return {
				id: entry.address,
				rank: entry.rank,
				trader: entry.address,
				totalPoints: entry.points,
				totalPointsFormatted: pointsNum.toLocaleString(undefined, {
					maximumFractionDigits: 2,
				}),
				totalTrades: 0,
				pointsPerTrade: "0",
				pointsPerTradeFormatted: "0",
				currentTier: tier,
				firstTradeTimestamp: new Date().toISOString(),
				lastTradeTimestamp: new Date().toISOString(),
				lastPointsAwarded: "0",
				lastPointsAwardedFormatted: "0",
				bronzeTierAt: null,
				silverTierAt: null,
				goldTierAt: null,
				lastTransactionHash: "0x...",
				lastBlockNumber: 0,
				lastBlockTimestamp: new Date().toISOString(),
			};
		});
	} catch (err) {
		console.error("Error fetching leaderboard:", err);
		return [];
	}
}
