import { Callout } from "@app/components/common/Callout";
import { StatTile, toneForValue } from "@app/components/common/StatTile";
import { Button } from "@app/components/ui/button";
import { Skeleton } from "@app/components/ui/skeleton";
import { useCarryFlow } from "@app/hooks/useCarryFlow";
import { useCarryPosition, useSpotTokens } from "@app/hooks/useMarketData";
import {
	basescanTx,
	formatFundingApr,
	formatPercent,
	formatQuantity,
	formatUsd,
} from "@lemon/core";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, type MetaFunction, useParams } from "react-router";

export const meta: MetaFunction = () => [{ title: "Carry position — Lemon Markets" }];

export default function CarryDetailPage() {
	const { id } = useParams();
	const queryClient = useQueryClient();
	const { data, isLoading } = useCarryPosition(id);
	const { data: spotTokens } = useSpotTokens();
	const flow = useCarryFlow();

	if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
	if (!data) {
		return (
			<Callout tone="warning" title="Position not found">
				<Link to="/carry" className="underline">
					Back to cash &amp; carry
				</Link>
			</Callout>
		);
	}

	const { position, repairOptions } = data;
	const token = spotTokens?.tokens.find((candidate) => candidate.symbol === position.tokenSymbol);

	// Both statuses mean at least one leg is live without its counterpart.
	const unhedged = position.status === "ORPHANED" || position.status === "SPOT_FILLED";
	const isLive = position.status === "OPEN";

	function refresh() {
		queryClient.invalidateQueries({ queryKey: ["carry-position", id] });
		queryClient.invalidateQueries({ queryKey: ["carry-positions"] });
	}

	async function runRepair(action: string) {
		if (!token) return;
		try {
			if (action === "retry_perp") await flow.repairShort(position);
			else if (action === "unwind_spot") await flow.unwindSpotOnly(position, token);
			refresh();
		} catch {
			refresh();
		}
	}

	async function runUnwind() {
		if (!token) return;
		try {
			await flow.unwind(position, token);
			refresh();
		} catch {
			refresh();
		}
	}

	const legs = [
		{
			name: `Spot — ${position.tokenSymbol}`,
			open: position.spotBuyTxHash,
			close: position.spotSellTxHash,
			detail: position.shares ? `${formatQuantity(position.shares, 6)} shares` : "—",
		},
		{
			name: `Short — ${position.avantisSymbol}`,
			open: position.perpOpenTxHash,
			close: position.perpCloseTxHash,
			detail: `${formatUsd(position.perpCollateralUsd)} margin at ${position.perpLeverage}x`,
		},
	];

	return (
		<div className="space-y-6">
			<Link
				to="/carry"
				className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-lime-400"
			>
				<ArrowLeft size={14} aria-hidden /> Cash &amp; carry
			</Link>

			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">
					{position.tokenSymbol} <span className="text-gray-500">/</span> {position.avantisSymbol}
				</h1>
				<p className="text-sm text-gray-400">
					Opened {new Date(position.createdAt).toLocaleString()}
				</p>
			</header>

			{/*
			  The whole point of tracking these positions: a half-open carry is
			  directional exposure the user did not choose. It gets the loudest
			  treatment on the page, with the concrete exposure named.
			*/}
			{unhedged && (
				<Callout tone="danger" title="This position is not hedged">
					<div className="space-y-3">
						<p>
							{position.spotBuyTxHash && !position.perpOpenTxHash
								? `You are holding ${position.shares ? formatQuantity(position.shares, 4) : ""} ${position.tokenSymbol} with no short against it — you are fully exposed to the price of ${position.avantisSymbol}.`
								: `A short on ${position.avantisSymbol} is open with no spot position hedging it.`}
						</p>
						{position.failureReason && (
							<p className="rounded bg-black/30 p-2 font-mono text-[11px] opacity-80">
								{position.failureReason}
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							{repairOptions.map((option) => (
								<Button
									key={option.action}
									type="button"
									size="sm"
									disabled={flow.isBusy || !token}
									onClick={() => runRepair(option.action)}
									className={
										option.action === "retry_perp"
											? "bg-lime-500 text-black hover:bg-lime-400"
											: "bg-white/10 text-white hover:bg-white/20"
									}
									title={option.description}
								>
									{option.label}
								</Button>
							))}
						</div>
						{repairOptions[0] && (
							<p className="text-xs opacity-75">{repairOptions[0].description}</p>
						)}
					</div>
				</Callout>
			)}

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatTile label="Notional per leg" value={formatUsd(position.notionalUsd)} />
				<StatTile
					label="Capital deployed"
					value={formatUsd((position.spotCostUsd ?? 0) + position.perpCollateralUsd)}
				/>
				<StatTile
					label="Entry funding"
					value={
						position.entryFundingRatePct !== null
							? formatFundingApr(position.entryFundingRatePct)
							: "—"
					}
					hint="APR, short side"
					tone={toneForValue(position.entryFundingRatePct ?? 0)}
				/>
				<StatTile
					label="Entry net APY"
					value={position.entryNetApyPct !== null ? formatPercent(position.entryNetApyPct) : "—"}
					tone={toneForValue(position.entryNetApyPct ?? 0)}
				/>
			</div>

			<section className="space-y-3">
				<h2 className="text-lg font-medium">Legs</h2>
				<div className="space-y-2">
					{legs.map((leg) => (
						<div
							key={leg.name}
							className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
						>
							<div>
								<p className="font-medium">{leg.name}</p>
								<p className="text-xs text-gray-500">{leg.detail}</p>
							</div>
							<div className="flex items-center gap-3 text-xs">
								<span
									className={
										leg.open
											? "rounded bg-lime-500/15 px-2 py-1 text-lime-400"
											: "rounded bg-gray-500/15 px-2 py-1 text-gray-500"
									}
								>
									{leg.close ? "closed" : leg.open ? "open" : "not opened"}
								</span>
								{leg.open && (
									<a
										href={basescanTx(leg.open)}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 font-mono text-gray-500 hover:text-lime-400"
									>
										{leg.open.slice(0, 10)}…
										<ExternalLink size={11} aria-hidden />
									</a>
								)}
							</div>
						</div>
					))}
				</div>
			</section>

			{isLive && (
				<div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
					<h2 className="mb-2 font-medium">Unwind</h2>
					<p className="mb-3 text-sm text-gray-400">
						Sells the spot leg and closes the short. Both must complete — if one fails the position
						returns here for repair rather than being left half-closed.
					</p>
					<Button
						type="button"
						onClick={runUnwind}
						disabled={flow.isBusy || !token}
						className="bg-white/10 hover:bg-white/20"
					>
						{flow.isBusy ? "Unwinding…" : "Unwind position"}
					</Button>
				</div>
			)}
		</div>
	);
}
