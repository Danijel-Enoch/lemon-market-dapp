import { BridgePanel } from "@app/components/position/BridgePanel";
import { PositionCard } from "@app/components/position/PositionCard";
import { SignInGate } from "@app/components/position/SignInGate";
import { WalletPanel } from "@app/components/position/WalletPanel";
import {
	formatUsd,
	formatUsdSigned,
	useSelfBalances,
	useSelfPositions,
	useSelfStatus,
} from "@lemon/client";
import { Callout, EmptyState, PageHeader, Skeleton, StatCard } from "@lemon/ui";
import { CandlestickChart, Layers } from "lucide-react";
import { useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Positions — Lemon" },
	{
		name: "description",
		content:
			"The delta-neutral positions you run yourself: both legs, whether they are actually hedged, and what the funding has paid.",
	},
];

/**
 * The positions a user runs themselves.
 *
 * A sibling of `/portfolio`, which stays exactly as it was and shows vault
 * shares. The two are separate pages rather than tabs on one because they are
 * separate products with separate custody, separate risks and separate ways of
 * going wrong — a vault share cannot become unhedged, and a self-managed
 * position has no withdrawal queue. Merging them would mean one page whose every
 * column applied to half its rows.
 *
 * The page is ordered by urgency rather than by chronology: anything unhedged
 * comes first, because that is the only state here that gets worse while nobody
 * is looking.
 */
export default function PositionsPage() {
	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Run by you"
				title="Positions"
				description="Each position is two legs at two venues: the asset in your own wallet, and a short against it on Pacifica. This page reads both venues directly rather than trusting our own records, so what you see is what they say — including when they disagree."
			/>

			<Gate />
		</div>
	);
}

function Gate() {
	const { data: status } = useSelfStatus();

	if (status && !status.available) {
		return (
			<Callout tone="warning" title="Self-managed positions are unavailable here">
				{status.reason} Vaults are unaffected — see{" "}
				<Link to="/vaults" className="underline">
					the vault board
				</Link>
				.
			</Callout>
		);
	}

	return (
		<SignInGate>
			<PositionsBody />
		</SignInGate>
	);
}

function PositionsBody() {
	const [includeClosed, setIncludeClosed] = useState(false);

	const { data, isLoading, isError, error } = useSelfPositions({ includeClosed });
	const { data: balanceData } = useSelfBalances();

	const positions = data?.positions ?? [];

	// Unhedged first, then drifted, then the rest. A position that has lost a leg
	// is the only thing on this page that is actively costing money in a way the
	// holder did not choose, and sorting it below a healthy one by creation date
	// would bury the one row that needed reading.
	const sorted = [...positions].sort((a, b) => {
		const rank = (p: (typeof positions)[number]) =>
			p.closedAt ? 3 : p.hedge.balanced ? 2 : p.status === "DRIFTED" ? 1 : 0;
		return rank(a) - rank(b);
	});

	const open = positions.filter((p) => !p.closedAt);
	const unhedged = open.filter((p) => !p.hedge.balanced);

	const totalValue = open.reduce(
		(sum, p) => sum + (p.economics.valueUsdc === null ? 0 : Number(p.economics.valueUsdc)),
		0,
	);
	const totalFunding = open.reduce((sum, p) => sum + Number(p.economics.fundingUsdc), 0);

	return (
		<div className="space-y-6">
			{/* The alarm, above everything, when there is one to raise. */}
			{unhedged.length > 0 && (
				<Callout
					tone="danger"
					title={`${unhedged.length} position${unhedged.length === 1 ? " is" : "s are"} not hedged`}
				>
					{unhedged.length === 1
						? "One of your positions has legs that no longer offset each other, so part of it is a directional bet on price rather than a basis trade."
						: "Some of your positions have legs that no longer offset each other, so part of them is a directional bet on price rather than a basis trade."}{" "}
					Each card below says which leg is missing and by how much.
				</Callout>
			)}

			{balanceData && (
				<div className="grid gap-4 lg:grid-cols-[1fr_360px]">
					<div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-3">
						<StatCard label="Open positions" value={String(open.length)} />
						<StatCard label="Position value" value={formatUsd(String(Math.round(totalValue)))} />
						<StatCard
							label="Funding earned"
							value={formatUsdSigned(String(Math.round(totalFunding)))}
						/>
					</div>

					<div className="space-y-4">
						<WalletPanel
							wallet={balanceData.wallet}
							balances={balanceData.balances}
							costs={balanceData.costs}
						/>
						<BridgePanel balances={balanceData.balances} />
					</div>
				</div>
			)}

			{!balanceData && (
				<div className="grid gap-4 lg:grid-cols-[1fr_360px]">
					<Skeleton className="h-24 w-full rounded-[var(--pon-r-lg,16px)]" />
					<Skeleton className="h-72 w-full rounded-[var(--pon-r-lg,16px)]" />
				</div>
			)}

			<div className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h2 className="firm-label text-[var(--pon-fg-0)]">
						{includeClosed ? "All positions" : "Open positions"}
					</h2>
					<button
						type="button"
						onClick={() => setIncludeClosed((value) => !value)}
						className="text-[11.5px] text-[var(--pon-fg-3)] underline transition-colors hover:text-[var(--pon-fg-0)]"
					>
						{includeClosed ? "Hide closed" : "Show closed"}
					</button>
				</div>

				{isLoading ? (
					<div className="space-y-3">
						{[0, 1].map((i) => (
							<Skeleton key={i} className="h-56 w-full rounded-[var(--pon-r-lg,16px)]" />
						))}
					</div>
				) : isError ? (
					<EmptyState
						icon={Layers}
						title="Your positions could not be loaded"
						description={
							error instanceof Error
								? error.message
								: "One of the venues holding your legs could not be reached, so nothing here can be shown honestly."
						}
					/>
				) : sorted.length === 0 ? (
					<EmptyState
						icon={CandlestickChart}
						title="No positions yet"
						description="Pick a market to see what it pays, what it costs to enter, and how long it takes to break even. Nothing commits until you sign it."
					/>
				) : (
					<div className="space-y-4">
						{sorted.map((position) => (
							<PositionCard key={position.id} position={position} />
						))}
					</div>
				)}

				{!isLoading && !isError && (
					<p className="text-[11.5px] text-[var(--pon-fg-3)]">
						Looking for something to enter?{" "}
						<Link to="/markets" className="underline hover:text-[var(--pon-fg-0)]">
							Browse the market board
						</Link>
						.
					</p>
				)}
			</div>
		</div>
	);
}
