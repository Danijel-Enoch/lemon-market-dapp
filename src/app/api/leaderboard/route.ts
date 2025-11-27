import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GraphQL query to fetch leaderboard entries
const LEADERBOARD_QUERY = `
  query GetLeaderboard {
    leaderboardEntries {
      firstTradeTimestamp
      goldTierAt
      id
      lastBlockNumber
      lastBlockTimestamp
      lastPointsAwarded
      lastTradeTimestamp
      trader
      totalTrades
      totalPoints
      silverTierAt
      pointsPerTrade
      lastTransactionHash
      currentTier
      bronzeTierAt
    }
  }
`;

interface LeaderboardEntry {
	firstTradeTimestamp: string;
	goldTierAt: string | null;
	id: string;
	lastBlockNumber: string;
	lastBlockTimestamp: string;
	lastPointsAwarded: string;
	lastTradeTimestamp: string;
	trader: string;
	totalTrades: string;
	totalPoints: string;
	silverTierAt: string | null;
	pointsPerTrade: string;
	lastTransactionHash: string;
	currentTier: string;
	bronzeTierAt: string | null;
}

interface GraphQLResponse {
	data?: {
		leaderboardEntries: LeaderboardEntry[];
	};
	errors?: Array<{
		message: string;
	}>;
}

// Helper function to format large numbers
function formatNumber(value: string): string {
	const num = parseFloat(value);
	if (num >= 1e9) {
		return `${(num / 1e9).toFixed(2)}B`;
	} else if (num >= 1e6) {
		return `${(num / 1e6).toFixed(2)}M`;
	} else if (num >= 1e3) {
		return `${(num / 1e3).toFixed(2)}K`;
	}
	return num.toLocaleString();
}

// Helper function to format timestamp to readable date
function formatTimestamp(timestamp: string): string {
	return new Date(parseInt(timestamp, 10) * 1000).toISOString();
}

// Helper function to format tier
function formatTier(tier: string): string {
	return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = searchParams.get("limit");
		const sortBy = searchParams.get("sortBy") || "totalPoints";
		const order = searchParams.get("order") || "desc";

		// Make GraphQL request to the subgraph
		const response = await fetch(process.env.SUBGRAPH_URL || "", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b",
			},
			body: JSON.stringify({
				query: LEADERBOARD_QUERY,
			}),
		});

		if (!response.ok) {
			throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
		}

		const result: GraphQLResponse = await response.json();

		if (result.errors && result.errors.length > 0) {
			return NextResponse.json(
				{
					error: "Failed to fetch leaderboard from subgraph",
					details: result.errors,
				},
				{ status: 500 },
			);
		}

		const leaderboardEntries = result.data?.leaderboardEntries || [];

		// Transform leaderboard entries for frontend consumption
		const transformedEntries = leaderboardEntries.map((entry, index) => ({
			id: entry.id,
			rank: index + 1, // Will be recalculated after sorting
			trader: entry.trader,
			totalPoints: entry.totalPoints,
			totalPointsFormatted: formatNumber(entry.totalPoints),
			totalTrades: parseInt(entry.totalTrades, 10),
			pointsPerTrade: entry.pointsPerTrade,
			pointsPerTradeFormatted: formatNumber(entry.pointsPerTrade),
			currentTier: formatTier(entry.currentTier),
			firstTradeTimestamp: formatTimestamp(entry.firstTradeTimestamp),
			lastTradeTimestamp: formatTimestamp(entry.lastTradeTimestamp),
			lastPointsAwarded: entry.lastPointsAwarded,
			lastPointsAwardedFormatted: formatNumber(entry.lastPointsAwarded),
			bronzeTierAt: entry.bronzeTierAt ? formatTimestamp(entry.bronzeTierAt) : null,
			silverTierAt: entry.silverTierAt ? formatTimestamp(entry.silverTierAt) : null,
			goldTierAt: entry.goldTierAt ? formatTimestamp(entry.goldTierAt) : null,
			lastTransactionHash: entry.lastTransactionHash,
			lastBlockNumber: parseInt(entry.lastBlockNumber, 10),
			lastBlockTimestamp: formatTimestamp(entry.lastBlockTimestamp),
		}));

		// Sort entries based on the sortBy parameter
		transformedEntries.sort((a, b) => {
			let aValue: number | string;
			let bValue: number | string;

			switch (sortBy) {
				case "totalPoints":
					aValue = parseFloat(a.totalPoints);
					bValue = parseFloat(b.totalPoints);
					break;
				case "totalTrades":
					aValue = a.totalTrades;
					bValue = b.totalTrades;
					break;
				case "pointsPerTrade":
					aValue = parseFloat(a.pointsPerTrade);
					bValue = parseFloat(b.pointsPerTrade);
					break;
				case "lastTradeTimestamp":
					aValue = new Date(a.lastTradeTimestamp).getTime();
					bValue = new Date(b.lastTradeTimestamp).getTime();
					break;
				default:
					aValue = parseFloat(a.totalPoints);
					bValue = parseFloat(b.totalPoints);
			}

			if (order === "asc") {
				return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
			} else {
				return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
			}
		});

		// Update ranks after sorting
		transformedEntries.forEach((entry, index) => {
			entry.rank = index + 1;
		});

		// Apply limit if specified
		const finalEntries = limit
			? transformedEntries.slice(0, parseInt(limit, 10))
			: transformedEntries;

		return NextResponse.json({
			success: true,
			data: finalEntries,
			total: transformedEntries.length,
			limit: limit ? parseInt(limit, 10) : null,
			sortBy,
			order,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to fetch leaderboard data",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
