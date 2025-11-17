import { Award as AwardIcon, Crown, Medal, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface LeaderboardRowProps {
	entry: LeaderboardEntry;
	onViewProfile?: (trader: string) => void;
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

export function LeaderboardRow({ entry, onViewProfile }: LeaderboardRowProps) {
	return (
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
						<div className="font-medium text-sm font-mono">{formatAddress(entry.trader)}</div>
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
				<Badge variant="outline" className={`gap-1 ${getTierColor(entry.currentTier)}`}>
					{getTierIcon(entry.currentTier)}
					{entry.currentTier}
				</Badge>
			</td>
			<td className="p-3">
				<div className="text-sm">{new Date(entry.lastTradeTimestamp).toLocaleDateString()}</div>
				<div className="text-muted-foreground text-xs">
					{new Date(entry.lastTradeTimestamp).toLocaleTimeString()}
				</div>
			</td>
			<td className="p-3">
				<Button size="sm" variant="outline" onClick={() => onViewProfile?.(entry.trader)}>
					View Profile
				</Button>
			</td>
		</tr>
	);
}
