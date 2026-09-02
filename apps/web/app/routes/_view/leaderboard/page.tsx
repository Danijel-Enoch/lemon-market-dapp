import { Callout } from "@app/components/common/Callout";
import { EmptyPanel } from "@app/components/common/EmptyState";
import { StatTile } from "@app/components/common/StatTile";
import { PageHeader } from "@app/components/site/PageHeader";
import { Skeleton } from "@app/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useGlobalLeaderboard, useLeaderboard, usePointsProfile } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { basescanAddress, formatUsd } from "@lemon/core";
import { ACTION_POINTS, pointsToNextTier, TIERS, USD_PER_VOLUME_POINT } from "@lemon/registry";
import { Trophy } from "lucide-react";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { useConnection } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Leaderboard — Lemon Markets" },
	{
		name: "description",
		content: "Points earned trading on Lemon Markets, and the Avantis global leaderboard.",
	},
];

type Board = "points" | "global";

function short(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Medal tint for the top three, neutral below. */
function rankClass(rank: number): string {
	if (rank === 1) return "text-amber-300";
	if (rank === 2) return "text-[var(--ink-1)]";
	if (rank === 3) return "text-orange-400";
	return "text-[var(--ink-2)]";
}

export default function LeaderboardPage() {
	const { address } = useConnection();
	const [board, setBoard] = useState<Board>("points");

	const { data: points, isLoading: pointsLoading } = useLeaderboard();
	const { data: global, isLoading: globalLoading } = useGlobalLeaderboard();
	const { data: profile } = usePointsProfile(address);

	const nextTier = profile ? pointsToNextTier(profile.total) : null;

	return (
		<div className="space-y-8">
			<PageHeader
				title="Leaderboard"
				description="Points accrue from trading through Lemon Markets. Every point-earning transaction is verified on-chain."
			/>

			{/* Your standing, when connected. */}
			{address && profile && (
				<div className="space-y-3">
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatTile
							label="Your points"
							value={profile.total.toLocaleString()}
							hint={profile.tier}
							tone={profile.total > 0 ? "positive" : "neutral"}
						/>
						<StatTile label="Rank" value={profile.rank ? `#${profile.rank}` : "—"} />
						<StatTile
							label="Perp volume"
							value={formatUsd(profile.perpVolumeUsd, { compact: true })}
							hint={`${profile.perpPoints.toLocaleString()} pts`}
						/>
						<StatTile
							label="Spot volume"
							value={formatUsd(profile.spotVolumeUsd, { compact: true })}
							hint={`${profile.spotPoints.toLocaleString()} pts`}
						/>
					</div>

					{nextTier && (
						<div className="rounded-lg bg-[var(--surface-3)] p-4">
							<div className="mb-2 flex items-center justify-between t-label">
								<span className="text-[var(--ink-2)]">
									{nextTier.remaining.toLocaleString()} points to {nextTier.next.name}
								</span>
								<span className="font-fono t-caption text-[var(--ink-2)]">
									{profile.total.toLocaleString()} / {nextTier.next.minPoints.toLocaleString()}
								</span>
							</div>
							<div className="h-1 overflow-hidden rounded-full bg-[var(--surface-5)]">
								<div
									className="h-full rounded-full bg-lime-500 transition-[width] duration-700 ease-out"
									style={{
										width: `${Math.min(100, (profile.total / nextTier.next.minPoints) * 100)}%`,
									}}
								/>
							</div>
						</div>
					)}
				</div>
			)}

			<Tabs value={board} onValueChange={(value) => setBoard(value as Board)}>
				<TabsList>
					<TabsTrigger value="points">Lemon points</TabsTrigger>
					<TabsTrigger value="global">Avantis global</TabsTrigger>
				</TabsList>
			</Tabs>

			{board === "points" ? (
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
						<div className="overflow-x-auto rounded-lg bg-[var(--surface-3)] scrollbar-hide">
							<table className="w-full min-w-[640px] t-label">
								<thead className="border-b border-[var(--line-soft)] text-left t-caption font-normal text-[var(--ink-2)]">
									<tr>
										<th className="px-3 py-2 font-normal">#</th>
										<th className="px-3 py-2 font-normal">Trader</th>
										<th className="px-3 py-2 font-normal">Tier</th>
										<th className="px-3 py-2 font-normal">Perp volume</th>
										<th className="px-3 py-2 font-normal">Spot volume</th>
										<th className="px-3 py-2 font-normal">Carries</th>
										<th className="px-3 py-2 text-right font-normal">Points</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--line-soft)]">
									{points.rows.map((row) => {
										const isYou = address?.toLowerCase() === row.address;
										return (
											<tr
												key={row.address}
												className={cn(
													"transition-colors hover:bg-[var(--surface-4)]",
													isYou && "bg-lime-500/[0.06]",
												)}
											>
												<td className={cn("px-3 py-2.5 font-fono", rankClass(row.rank))}>
													{row.rank}
												</td>
												<td className="px-3 py-2.5">
													<a
														href={basescanAddress(row.address)}
														target="_blank"
														rel="noreferrer"
														className="font-fono t-caption text-[var(--ink-1)] transition-colors hover:text-lime-400"
													>
														{short(row.address)}
													</a>
													{isYou && (
														<span className="ml-2 rounded-sm bg-lime-500/15 px-1.5 py-0.5 t-micro uppercase text-lime-400">
															you
														</span>
													)}
												</td>
												<td className="px-3 py-2.5 t-caption text-[var(--ink-2)]">{row.tier}</td>
												<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
													{formatUsd(row.perpVolumeUsd, { compact: true })}
												</td>
												<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
													{formatUsd(row.spotVolumeUsd, { compact: true })}
												</td>
												<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
													{row.carriesOpened}
												</td>
												<td className="px-3 py-2.5 text-right font-fono text-lime-400">
													{row.points.toLocaleString()}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					<div className="rounded-lg bg-[var(--surface-3)] p-5 t-label">
						<h2 className="mb-3 t-body font-medium text-[var(--ink-1)]">How points are earned</h2>
						<ul className="space-y-1.5 text-[var(--ink-2)]">
							<li>
								<span className="font-fono text-lime-400">1 pt</span> per ${USD_PER_VOLUME_POINT} of
								perp volume, read directly from Avantis.
							</li>
							<li>
								<span className="font-fono text-lime-400">1 pt</span> per ${USD_PER_VOLUME_POINT} of
								spot volume, verified against the transaction on-chain.
							</li>
							<li>
								<span className="font-fono text-lime-400">{ACTION_POINTS.carry_opened} pts</span>{" "}
								per cash-and-carry opened — two legs across two venues.
							</li>
							<li>
								<span className="font-fono text-lime-400">{ACTION_POINTS.basket_entry} pts</span>{" "}
								per basket entry.
							</li>
						</ul>
						<p className="mt-4 t-caption text-white/35">
							Tiers:{" "}
							{TIERS.map((tier) => `${tier.name} (${tier.minPoints.toLocaleString()})`).join(" · ")}
							. Tiers are cosmetic and confer nothing.
						</p>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					<Callout tone="info" title="This is Avantis' board, not ours">
						It ranks every trader on the protocol by realised PnL, regardless of whether they traded
						through this app — so it is shown separately rather than merged into the points board.
					</Callout>

					{globalLoading ? (
						<Skeleton className="h-64 w-full" />
					) : !global?.rows.length ? (
						<EmptyPanel icon={Trophy} title="Global leaderboard unavailable" />
					) : (
						<div className="overflow-x-auto rounded-lg bg-[var(--surface-3)] scrollbar-hide">
							<table className="w-full min-w-[620px] t-label">
								<thead className="border-b border-[var(--line-soft)] text-left t-caption font-normal text-[var(--ink-2)]">
									<tr>
										<th className="px-3 py-2 font-normal">#</th>
										<th className="px-3 py-2 font-normal">Trader</th>
										<th className="px-3 py-2 font-normal">Volume</th>
										<th className="px-3 py-2 font-normal">Trades</th>
										<th className="px-3 py-2 font-normal">Win rate</th>
										<th className="px-3 py-2 text-right font-normal">PnL</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--line-soft)]">
									{global.rows.map((row) => (
										<tr key={row.trader} className="transition-colors hover:bg-[var(--surface-4)]">
											<td className={cn("px-3 py-2.5 font-fono", rankClass(row.rank))}>
												{row.rank}
											</td>
											<td className="px-3 py-2.5">
												<a
													href={basescanAddress(row.trader)}
													target="_blank"
													rel="noreferrer"
													className="font-fono t-caption text-[var(--ink-1)] transition-colors hover:text-lime-400"
												>
													{short(row.trader)}
												</a>
											</td>
											<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
												{formatUsd(row.volumeUsd, { compact: true })}
											</td>
											<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
												{row.trades.toLocaleString()}
											</td>
											<td className="px-3 py-2.5 font-fono t-caption text-[var(--ink-2)]">
												{row.winRatePercent.toFixed(1)}%
											</td>
											<td
												className={cn(
													"px-3 py-2.5 text-right font-fono",
													row.pnlUsd >= 0 ? "text-lime-400" : "text-red-400",
												)}
											>
												{formatUsd(row.pnlUsd, { compact: true })}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
