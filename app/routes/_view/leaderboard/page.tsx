import { Badge } from "@app/components/ui/badge";
import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@app/components/ui/select";
import { fetchLeaderboardData } from "@app/lib/leaderboard-service";
import type { Metadata } from "@app/lib/types";
import {
	Award as AwardIcon,
	ChevronLeft,
	ChevronRight,
	Crown,
	Medal,
	RefreshCw,
	Users,
} from "lucide-react";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";

export const metadata: Metadata = {
	title: "Leaderboard - Lemon Markets",
	description: "View top traders and compete for rewards",
};

export async function loader({ request }: { request: Request }) {
	const url = new URL(request.url);
	const limit = Number(url.searchParams.get("limit")) || 50;
	const page = Number(url.searchParams.get("page")) || 1;
	const offset = (page - 1) * limit;

	const leaderboardData = await fetchLeaderboardData({ limit, offset, page });

	return {
		leaderboardData,
		limit,
		page,
	};
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
	const { leaderboardData, limit, page } = useLoaderData<typeof loader>();
	const [_searchParams, setSearchParams] = useSearchParams();
	const navigation = useNavigation();
	const isLoading = navigation.state !== "idle";

	const handleSort = (_newSortBy: string) => {
		// Sort is currently mock
	};

	const handleLimitChange = (value: string) => {
		setSearchParams((prev) => {
			prev.set("limit", value);
			prev.set("page", "1");
			return prev;
		});
	};

	const handleNextPage = () => {
		setSearchParams((prev) => {
			prev.set("page", String(page + 1));
			return prev;
		});
	};

	const handlePrevPage = () => {
		setSearchParams((prev) => {
			prev.set("page", String(Math.max(1, page - 1)));
			return prev;
		});
	};

	const handleRefresh = () => {
		setSearchParams((prev) => {
			prev.set("_refresh", String(Date.now()));
			return prev;
		});
	};

	// Mock stats for dashboard (they were internally calculated before)
	const _totalTraders = leaderboardData.length;
	const _totalTrades = 0;
	const _avgPointsPerTrade = "0";

	return (
		<div className="w-full mt-8">
			<div className="w-full">
				<Card className="pb-0">
					<CardHeader className="border-b border-gray-100/10">
						<div className="flex items-center justify-between">
							<CardTitle>Trading Leaderboard</CardTitle>
							<div className="flex items-center gap-2">
								<Button
									onClick={handleRefresh}
									disabled={isLoading}
									variant="outline"
									size="sm"
									className="gap-2"
								>
									<RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
									<span className="hidden md:inline">Refresh</span>
								</Button>
								<Select value={String(limit)} onValueChange={handleLimitChange}>
									<SelectTrigger className="w-[100px] text-sm border-border">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="25">Top 25</SelectItem>
										<SelectItem value="50">Top 50</SelectItem>
										<SelectItem value="100">Top 100</SelectItem>
									</SelectContent>
								</Select>
								<div className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
									<Button
										onClick={handlePrevPage}
										disabled={page === 1 || isLoading}
										variant="outline"
										size="sm"
										className="h-8 w-8 p-0"
									>
										<ChevronLeft className="w-4 h-4" />
									</Button>
									<span className="px-3 min-w-[80px] text-center">Page {page}</span>
									<Button
										onClick={handleNextPage}
										disabled={isLoading || leaderboardData.length < limit}
										variant="outline"
										size="sm"
										className="h-8 w-8 p-0"
									>
										<ChevronRight className="w-4 h-4" />
									</Button>
								</div>
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
											Trader
										</th>
										<th
											className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground"
											onClick={() => handleSort("totalPoints")}
										>
											Total Points
										</th>

										<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
											Tier
										</th>
									</tr>
								</thead>
								<tbody>
									{isLoading && leaderboardData.length === 0 ? (
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
													<Badge
														variant="outline"
														className={`gap-1 ${getTierColor(entry.currentTier)}`}
													>
														{getTierIcon(entry.currentTier)}
														{entry.currentTier}
													</Badge>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						{!isLoading && leaderboardData.length > 0 && (
							<div className="px-6 py-4 border-t border-gray-100/10 flex flex-col md:flex-row items-center justify-between gap-6">
								<div className="text-sm text-muted-foreground">
									Showing {(page - 1) * limit + 1} - {(page - 1) * limit + leaderboardData.length}{" "}
									entries
								</div>
								<div className="flex items-center gap-2">
									<Button
										onClick={handlePrevPage}
										disabled={page === 1 || isLoading}
										variant="outline"
										size="sm"
									>
										<ChevronLeft className="w-4 h-4 mr-1" />
										Previous
									</Button>
									<span className="text-sm text-muted-foreground px-2">Page {page}</span>
									<Button
										onClick={handleNextPage}
										disabled={isLoading || leaderboardData.length < limit}
										variant="outline"
										size="sm"
									>
										Next
										<ChevronRight className="w-4 h-4 ml-1" />
									</Button>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
