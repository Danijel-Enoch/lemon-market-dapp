import { Callout } from "@app/components/common/Callout";
import { EmptyPanel } from "@app/components/common/EmptyState";
import { LabelledProgress } from "@app/components/pons/Progress";
import { StatCard } from "@app/components/pons/StatCard";
import { PageHeader } from "@app/components/site/PageHeader";
import { Badge } from "@app/components/ui/badge";
import { Skeleton } from "@app/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@app/components/ui/table";
import { useLeaderboard, usePointsProfile } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { basescanAddress, formatUsd } from "@lemon/core";
import { ACTION_POINTS, pointsToNextTier, TIERS, USD_PER_VOLUME_POINT } from "@lemon/registry";
import { Trophy } from "lucide-react";
import type { MetaFunction } from "react-router";
import { useConnection } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Leaderboard — Lemon Markets" },
	{ name: "description", content: "Points earned trading on Lemon Markets." },
];

function short(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Medal tint for the top three, neutral below. */
function rankClass(rank: number): string {
	if (rank === 1) return "text-[var(--pon-amber)]";
	if (rank === 2) return "text-[var(--pon-fg)]";
	if (rank === 3) return "text-[var(--pon-lime-3)]";
	return "text-[var(--pon-fg-3)]";
}

export default function LeaderboardPage() {
	const { address } = useConnection();

	const { data: points, isLoading: pointsLoading } = useLeaderboard();
	const { data: profile } = usePointsProfile(address);

	const nextTier = profile ? pointsToNextTier(profile.total) : null;

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Protocol"
				title="Leaderboard"
				description="Points accrue from trading through Lemon Markets. Every point-earning transaction is verified on-chain."
			/>

			{/* Your standing, when connected. */}
			{address && profile && (
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<StatCard
							label="Your points"
							value={profile.total.toLocaleString()}
							delta={profile.tier}
							tone={profile.total > 0 ? "positive" : "neutral"}
						/>
						<StatCard label="Rank" value={profile.rank ? `#${profile.rank}` : "—"} />
						<StatCard
							label="Perp volume"
							value={formatUsd(profile.perpVolumeUsd, { compact: true })}
							delta={`${profile.perpPoints.toLocaleString()} pts`}
						/>
						<StatCard
							label="Spot volume"
							value={formatUsd(profile.spotVolumeUsd, { compact: true })}
							delta={`${profile.spotPoints.toLocaleString()} pts`}
						/>
					</div>

					{nextTier && (
						<div className="rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
							<LabelledProgress
								size="lg"
								label={`${nextTier.remaining.toLocaleString()} points to ${nextTier.next.name}`}
								value={profile.total / nextTier.next.minPoints}
								caption={`${profile.total.toLocaleString()} of ${nextTier.next.minPoints.toLocaleString()} points`}
							/>
						</div>
					)}
				</div>
			)}

			<div className="space-y-4">
				{!pointsLoading && points?.available === false && (
					<Callout tone="warning" title="Points are not configured">
						The leaderboard needs a database. Set <code>DATABASE_URL</code> and run{" "}
						<code>bun run db:deploy</code>.
					</Callout>
				)}

				{pointsLoading ? (
					<Skeleton className="h-64 w-full" />
				) : !points?.rows.length ? (
					<EmptyPanel icon={Trophy} title="No points yet">
						Trade a perp, buy spot, or open a cash-and-carry to get on the board.
					</EmptyPanel>
				) : (
					<div className="rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="pon-section-label">Standings</h2>
							<span className="t-caption text-[var(--pon-fg-3)]">{points.rows.length}</span>
						</div>

						<Table className="min-w-[640px]">
							<TableHeader>
								<TableRow>
									<TableHead>#</TableHead>
									<TableHead>Trader</TableHead>
									<TableHead>Tier</TableHead>
									<TableHead className="text-right">Perp volume</TableHead>
									<TableHead className="text-right">Spot volume</TableHead>
									<TableHead className="text-right">Carries</TableHead>
									<TableHead className="text-right">Points</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{points.rows.map((row) => {
									const isYou = address?.toLowerCase() === row.address;
									return (
										<TableRow key={row.address} className={cn(isYou && "bg-[var(--pon-lime-dim)]")}>
											<TableCell className={cn("font-fono font-semibold", rankClass(row.rank))}>
												{row.rank}
											</TableCell>
											<TableCell>
												<a
													href={basescanAddress(row.address)}
													target="_blank"
													rel="noreferrer"
													className="font-fono transition-colors hover:text-[var(--pon-lime)]"
												>
													{short(row.address)}
												</a>
												{isYou && (
													<Badge variant="chip-accent" className="ml-2 uppercase">
														you
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-[var(--pon-fg-2)]">{row.tier}</TableCell>
											<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
												{formatUsd(row.perpVolumeUsd, { compact: true })}
											</TableCell>
											<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
												{formatUsd(row.spotVolumeUsd, { compact: true })}
											</TableCell>
											<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
												{row.carriesOpened}
											</TableCell>
											<TableCell className="font-fono text-right font-semibold text-[var(--pon-lime)]">
												{row.points.toLocaleString()}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}

				<div className="rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
					<h2 className="pon-section-label mb-4">How points are earned</h2>
					<ul className="space-y-2 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">
						<li>
							<span className="font-fono font-semibold text-[var(--pon-lime)]">1 pt</span> per $
							{USD_PER_VOLUME_POINT} of perp volume, recorded from the orders placed through this
							app.
						</li>
						<li>
							<span className="font-fono font-semibold text-[var(--pon-lime)]">1 pt</span> per $
							{USD_PER_VOLUME_POINT} of spot volume, verified against the transaction on-chain.
						</li>
						<li>
							<span className="font-fono font-semibold text-[var(--pon-lime)]">
								{ACTION_POINTS.carry_opened} pts
							</span>{" "}
							per cash-and-carry opened — two legs across two venues.
						</li>
						<li>
							<span className="font-fono font-semibold text-[var(--pon-lime)]">
								{ACTION_POINTS.basket_entry} pts
							</span>{" "}
							per basket entry.
						</li>
					</ul>
					<p className="mt-5 border-t border-[var(--pon-line)] pt-4 t-caption text-[var(--pon-fg-4)]">
						Tiers:{" "}
						{TIERS.map((tier) => `${tier.name} (${tier.minPoints.toLocaleString()})`).join(" · ")}.
						Tiers are cosmetic and confer nothing.
					</p>
				</div>
			</div>
		</div>
	);
}
