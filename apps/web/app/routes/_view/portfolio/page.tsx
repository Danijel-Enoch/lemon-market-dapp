import { PositionList } from "@app/components/basis/PositionList";
import { Callout } from "@app/components/common/Callout";
import { StatCard, toneForValue } from "@app/components/pons/StatCard";
import { PageHeader, SubHeading } from "@app/components/site/PageHeader";
import { EmptyState } from "@app/components/ui/EmptyState";
import { useBasisPositions } from "@app/hooks/useMarketData";
import { formatPercent, formatUsd } from "@lemon/core";
import { Wallet } from "lucide-react";
import { Link, type MetaFunction } from "react-router";
import { useConnection } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Portfolio — Lemon" },
	{ name: "description", content: "Your open and closed basis positions." },
];

export default function PortfolioPage() {
	const { address, isConnected } = useConnection();
	const { data } = useBasisPositions(address);

	const positions = data?.positions ?? [];
	const live = positions.filter(
		(position) => position.status === "OPEN" || position.status === "UNWINDING",
	);
	const unhedged = positions.filter(
		(position) => position.status === "ORPHANED" || position.status === "SPOT_FILLED",
	);

	const deployed = live.reduce(
		(total, position) => total + (position.spotCostUsd ?? 0) + position.perpCollateralUsd,
		0,
	);
	// Weighted by capital, not a plain mean: averaging the percentages would let
	// a $50 position move the headline as much as a $50,000 one.
	const weightedApy =
		deployed > 0
			? live.reduce((total, position) => {
					const capital = (position.spotCostUsd ?? 0) + position.perpCollateralUsd;
					return total + (position.entryNetApyPct ?? 0) * capital;
				}, 0) / deployed
			: 0;

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Your book"
				title="Portfolio"
				description="Every basis position you have opened, with the legs that make it up and what it earned."
			/>

			{!isConnected ? (
				<EmptyState
					icon={Wallet}
					title="Connect a wallet"
					description="Positions are keyed to the wallet you sign in with."
				/>
			) : (
				<>
					{unhedged.length > 0 && (
						<Callout tone="danger" title="A position is not hedged">
							{unhedged.length === 1
								? "One position has a leg live without its counterpart, which means directional exposure you did not choose."
								: `${unhedged.length} positions have a leg live without its counterpart, which means directional exposure you did not choose.`}{" "}
							Open it below to repair or unwind it.
						</Callout>
					)}

					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<StatCard label="Open positions" value={`${live.length}`} delta="delta neutral" />
						<StatCard label="Capital deployed" value={formatUsd(deployed)} delta="spot + margin" />
						<StatCard
							label="Weighted entry APY"
							value={live.length ? formatPercent(weightedApy) : "—"}
							delta="at entry, by capital"
							tone={toneForValue(weightedApy)}
						/>
						<StatCard
							label="Needs attention"
							value={`${unhedged.length}`}
							delta={unhedged.length ? "unhedged legs" : "all hedged"}
							tone={unhedged.length ? "negative" : "neutral"}
						/>
					</div>

					<section className="space-y-3">
						<SubHeading
							title="Positions"
							actions={
								<Link
									to="/"
									className="rounded-full border border-[var(--pon-line-2)] px-3.5 py-1.5 text-[13px] text-[var(--pon-fg-2)] transition-colors hover:border-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]"
								>
									Browse markets
								</Link>
							}
						/>
						<PositionList />
					</section>
				</>
			)}
		</div>
	);
}
