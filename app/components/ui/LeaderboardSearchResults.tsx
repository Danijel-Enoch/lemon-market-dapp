import { Badge } from "@app/components/ui/badge";
import type { LeaderboardEntry } from "@app/lib/leaderboard-service";
import { AwardIcon, Crown, Medal, Users } from "lucide-react";
import { Card, CardContent } from "./card";

interface SearchResultsProps {
	results: LeaderboardEntry[];
}

export const formatAddress = (address: string) => {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const getTierIcon = (tier: string) => {
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

export const getTierColor = (tier: string) => {
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

export function LeaderboardSearchResults({ results }: SearchResultsProps) {
	return results.length === 0 ? (
		<p className="capitalize text-center">not found</p>
	) : (
		<div className="w-full">
			<Card className="pb-0">
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b border-gray-100/10 bg-muted/30">
									<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
										Rank
									</th>
									<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground">
										Trader
									</th>
									<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase cursor-pointer hover:text-foreground">
										Total Points
									</th>

									<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
										Tier
									</th>
								</tr>
							</thead>
							<tbody>
								{results.map((entry) => (
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
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
