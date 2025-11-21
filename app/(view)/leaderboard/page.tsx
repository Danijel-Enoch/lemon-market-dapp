"use client";

import {
	Award as AwardIcon,
	Crown,
	Medal,
	RefreshCw,
	Target,
	TrendingUp,
	Trophy,
	Users,
	Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export default function LeaderboardPage() {
	const [sortBy, setSortBy] = useState("totalPoints");
	const [order, setOrder] = useState("desc");
	const [limit, setLimit] = useState<number>(50);

	const [{ loading, error: fetchError, value: leaderboardResult }, fetchLeaderboard] =
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

	const leaderboardData = useMemo(() => leaderboardResult || [], [leaderboardResult]);
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
	const totalTrades = leaderboardData.reduce((sum, entry) => sum + entry.totalTrades, 0);
	const avgPointsPerTrade =
		leaderboardData.length > 0
			? (
					leaderboardData.reduce((sum, entry) => sum + parseFloat(entry.pointsPerTrade), 0) /
					leaderboardData.length
				).toFixed(0)
			: "0";

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-primary/10 rounded-lg">
								<Trophy className="w-6 h-6 text-primary" />
							</div>
							<div>
								<h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
								<p className="text-muted-foreground text-sm">
									Top performing traders and strategies
								</p>
							</div>
						</div>
						<Button
							onClick={fetchLeaderboard}
							disabled={loading}
							variant="outline"
							size="sm"
							className="gap-2"
						>
							<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
							Refresh
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Users className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Total Traders
								</div>
							</div>
							<div className="text-2xl font-bold">{totalTraders.toLocaleString()}</div>
							<div className="text-xs text-success mt-1">Real-time data</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Volume2 className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Total Trades
								</div>
							</div>
							<div className="text-2xl font-bold">{totalTrades.toLocaleString()}</div>
							<div className="text-xs text-success mt-1">Across all traders</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<TrendingUp className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Avg Points/Trade
								</div>
							</div>
							<div className="text-2xl font-bold">{avgPointsPerTrade}</div>
							<div className="text-xs text-muted-foreground mt-1">Average reward</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Target className="w-4 h-4 text-primary" />
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase">
									Active Tiers
								</div>
							</div>
							<div className="text-2xl font-bold">
								{new Set(leaderboardData.map((entry) => entry.currentTier)).size}
							</div>
							<div className="text-xs text-muted-foreground mt-1">Tier diversity</div>
						</CardContent>
					</Card>
				</div>

				{error && (
					<Card className="mb-8 border-destructive">
						<CardContent className="p-4">
							<div className="text-destructive">Error: {error}</div>
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
									onChange={(e) => setLimit(Number(e.target.value))}
									className="text-sm bg-background border border-border rounded px-2 py-1"
								>
									<option value={25}>Top 25</option>
									<option value={50}>Top 50</option>
									<option value={100}>Top 100</option>
								</select>
							</div>
						</div>
					</CardHeader>
					<CardContent className="p-0">
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
											Trader {sortBy === "trader" && (order === "desc" ? "↓" : "↑")}
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("totalPoints")}
										>
											Total Points {sortBy === "totalPoints" && (order === "desc" ? "↓" : "↑")}
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("totalTrades")}
										>
											Trades {sortBy === "totalTrades" && (order === "desc" ? "↓" : "↑")}
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("pointsPerTrade")}
										>
											Points/Trade {sortBy === "pointsPerTrade" && (order === "desc" ? "↓" : "↑")}
										</th>
										<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
											Tier
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("lastTradeTimestamp")}
										>
											Last Trade {sortBy === "lastTradeTimestamp" && (order === "desc" ? "↓" : "↑")}
										</th>
									</tr>
								</thead>
								<tbody>
									{loading ? (
										<tr>
											<td colSpan={8} className="text-center p-8">
												<div className="flex items-center justify-center gap-2">
													<RefreshCw className="w-4 h-4 animate-spin" />
													Loading leaderboard...
												</div>
											</td>
										</tr>
									) : leaderboardData.length === 0 ? (
										<tr>
											<td colSpan={8} className="text-center p-8 text-muted-foreground">
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
																{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
															</span>
														)}
														<span className="font-bold text-sm">#{entry.rank}</span>
													</div>
												</td>
												<td className="p-3">
													<div className="flex items-center gap-3">
														<div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
															<Users className="w-4 h-4" />
														</div>
														<div>
															<div className="font-medium text-sm font-mono">
																{formatAddress(entry.trader)}
															</div>
															<div className="text-muted-foreground text-xs">
																Since {new Date(entry.firstTradeTimestamp).toLocaleDateString()}
															</div>
														</div>
													</div>
												</td>
												<td className="p-3">
													<div className="font-bold text-success">{entry.totalPointsFormatted}</div>
													<div className="text-muted-foreground text-xs">
														Last: {entry.lastPointsAwardedFormatted}
													</div>
												</td>
												<td className="p-3">
													<div className="font-medium">{entry.totalTrades.toLocaleString()}</div>
												</td>
												<td className="p-3">
													<div className="font-medium">{entry.pointsPerTradeFormatted}</div>
												</td>
												<td className="p-3">
													<Badge
														variant="outline"
														className={`gap-1 ${getTierColor(entry.currentTier)}`}
													>
														{getTierIcon(entry.currentTier)}
														{entry.currentTier}
													</Badge>
												</td>
												<td className="p-3">
													<div className="text-sm">
														{new Date(entry.lastTradeTimestamp).toLocaleDateString()}
													</div>
													<div className="text-muted-foreground text-xs">
														{new Date(entry.lastTradeTimestamp).toLocaleTimeString()}
													</div>
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
