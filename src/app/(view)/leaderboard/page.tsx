import {
	Award as AwardIcon,
	Crown,
	Medal,
	RefreshCw, Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useAsyncFn from "react-use/lib/useAsyncFn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Leaderboard - Lemon Markets",
	description: "View top traders and compete for rewards"
};

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

interface ApiLeaderboardEntry {
	address: string;
	points: string;
	rank: number;
}

interface ApiLeaderboardResponse {
	success: boolean;
	data: ApiLeaderboardEntry[];
}

const getTierIcon = (tier: string) => {
	switch (tier.toLowerCase()) {
		case "gold":
			return <Crown className="w-4 h-4 text-yellow-500" />;
		case "silver":
			return <Medal className="w-4 h-4 text-gray-400" />;
		case "bronze":
			return <AwardIcon className="w-4 h-4 text-orange-600" />;
		default:
			return <Badge className="w-4 h-4 text-gray-500" />;
	}
};

const getTierColor = (tier: string) => {
	switch (tier.toLowerCase()) {
		case "gold":
			return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
		case "silver":
			return "bg-gray-400/10 text-gray-500 border-gray-400/20";
		case "bronze":
			return "bg-orange-600/10 text-orange-600 border-orange-600/20";
		default:
			return "bg-gray-500/10 text-gray-500 border-gray-500/20";
	}
};

const formatAddress = (address: string) => {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const BASE_URL =
	import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz";

export default function LeaderboardPage() {
	const [sortBy, setSortBy] = useState("totalPoints");
	const [order, setOrder] = useState("desc");
	const [limit, setLimit] = useState<number>(50);

	const [
		{ loading, error: fetchError, value: leaderboardResult },
		fetchLeaderboard
	] = useAsyncFn(async () => {
		const response = await fetch(`${BASE_URL}/leaderboard`);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch leaderboard: ${response.statusText}`
			);
		}
		const result: ApiLeaderboardResponse = await response.json();

		if (!result.success) {
			throw new Error("API returned unsuccessful response");
		}

		// Transform API data to LeaderboardEntry format
		const transformedData: LeaderboardEntry[] = result.data.map((entry) => {
			const pointsNum = Number(entry.points) / 1e6; // Assuming points are in smallest unit
			const tier =
				entry.rank <= 3
					? "Gold"
					: entry.rank <= 10
					? "Silver"
					: "Bronze";

			return {
				id: entry.address,
				rank: entry.rank,
				trader: entry.address,
				totalPoints: entry.points,
				totalPointsFormatted: pointsNum.toLocaleString(undefined, {
					maximumFractionDigits: 2
				}),
				totalTrades: 0, // Not provided by API
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
				lastBlockTimestamp: new Date().toISOString()
			};
		});

		return transformedData;
	}, [sortBy, order, limit]);

	const leaderboardData = useMemo(
		() => leaderboardResult || [],
		[leaderboardResult]
	);
	const error = fetchError ? fetchError.message : null;

	useEffect(() => {
		fetchLeaderboard();
	}, [fetchLeaderboard]);

	const handleSort = (newSortBy: string) => {
		if (sortBy === newSortBy) {
			setOrder(order === "desc" ? "asc" : "desc");
		} else {
			setSortBy(newSortBy);
			setOrder("desc");
		}
	};

	const totalTraders = leaderboardData.length;
	const totalTrades = leaderboardData.reduce(
		(sum, entry) => sum + entry.totalTrades,
		0
	);
	const avgPointsPerTrade =
		leaderboardData.length > 0
			? (
					leaderboardData.reduce(
						(sum, entry) => sum + parseFloat(entry.pointsPerTrade),
						0
					) / leaderboardData.length
			  ).toFixed(0)
			: "0";

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-medium text-muted-foreground">
								Leaderboard
							</h1>
							<p className="text-muted-foreground text-xs">
								Top performing traders and strategies
							</p>
						</div>
						<Button
							onClick={fetchLeaderboard}
							disabled={loading}
							variant="outline"
							size="sm"
							className="gap-2"
						>
							<RefreshCw
								className={`w-4 h-4 ${
									loading ? "animate-spin" : ""
								}`}
							/>
							Refresh
						</Button>
					</div>
				</div>

				{error && (
					<Card className="mb-8 border-destructive">
						<CardContent className="p-4">
							<div className="text-destructive">
								Error: {error}
							</div>
						</CardContent>
					</Card>
				)}

				<Card>
					<CardHeader className="border-b border-gray-100/10">
						<div className="flex items-center justify-between">
							<CardTitle>Trading Leaderboard</CardTitle>
							<div className="flex items-center gap-2">
								<select
									value={limit}
									onChange={(e) =>
										setLimit(Number(e.target.value))
									}
									className="text-sm bg-background border border-border rounded px-2 py-1"
								>
									<option value={25}>Top 25</option>
									<option value={50}>Top 50</option>
									<option value={100}>Top 100</option>
								</select>
							</div>
						</div>
					</CardHeader>
					<CardContent className="p-0 mb-12 lg:mb-10">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-gray-100/10 bg-muted/30">
										<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
											Rank
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("trader")}
										>
											Trader{" "}
											{sortBy === "trader" &&
												(order === "desc" ? "↓" : "↑")}
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() =>
												handleSort("totalPoints")
											}
										>
											Total Points{" "}
											{sortBy === "totalPoints" &&
												(order === "desc" ? "↓" : "↑")}
										</th>

										<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
											Tier
										</th>
									</tr>
								</thead>
								<tbody>
									{loading ? (
										<tr>
											<td
												colSpan={8}
												className="text-center p-8"
											>
												<div className="flex items-center justify-center gap-2">
													<RefreshCw className="w-4 h-4 animate-spin" />
													Loading leaderboard...
												</div>
											</td>
										</tr>
									) : leaderboardData.length === 0 ? (
										<tr>
											<td
												colSpan={8}
												className="text-center p-8 text-muted-foreground"
											>
												No leaderboard data available
											</td>
										</tr>
									) : (
										leaderboardData.map((entry) => (
											<tr
												key={entry.id}
												className="border-b border-gray-100/10 hover:bg-card-hover transition-colors"
											>
												<td className="p-3">
													<div className="flex items-center gap-2">
														{entry.rank <= 3 && (
															<span className="text-lg">
																{entry.rank ===
																1
																	? "🥇"
																	: entry.rank ===
																	  2
																	? "🥈"
																	: "🥉"}
															</span>
														)}
														<span className="font-bold text-sm">
															#{entry.rank}
														</span>
													</div>
												</td>
												<td className="p-3">
													<div className="flex items-center gap-3">
														<div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
															<Users className="w-4 h-4" />
														</div>
														<div>
															<div className="font-medium text-sm font-mono">
																{formatAddress(
																	entry.trader
																)}
															</div>
															<div className="text-muted-foreground text-xs">
																Since{" "}
																{new Date(
																	entry.firstTradeTimestamp
																).toLocaleDateString()}
															</div>
														</div>
													</div>
												</td>
												<td className="p-3">
													<div className="font-bold text-success">
														{
															entry.totalPointsFormatted
														}
													</div>
													<div className="text-muted-foreground text-xs">
														Last:{" "}
														{
															entry.lastPointsAwardedFormatted
														}
													</div>
												</td>

												<td className="p-3">
													<Badge
														variant="outline"
														className={`gap-1 ${getTierColor(
															entry.currentTier
														)}`}
													>
														{getTierIcon(
															entry.currentTier
														)}
														{entry.currentTier}
													</Badge>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
