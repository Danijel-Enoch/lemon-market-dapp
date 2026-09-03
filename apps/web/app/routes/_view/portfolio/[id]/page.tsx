import { Callout } from "@app/components/common/Callout";
import { StatCard, toneForValue } from "@app/components/pons/StatCard";
import { PageHeader, SubHeading } from "@app/components/site/PageHeader";
import { Button } from "@app/components/ui/button";
import { Skeleton } from "@app/components/ui/skeleton";
import { useBasisFlow } from "@app/hooks/useBasisFlow";
import { useBasisMarket, useBasisPosition } from "@app/hooks/useMarketData";
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

export const meta: MetaFunction = () => [{ title: "Position — Lemon" }];

export default function PositionDetailPage() {
	const { id } = useParams();
	const queryClient = useQueryClient();
	const { data, isLoading } = useBasisPosition(id);
	const flow = useBasisFlow();

	// The spot leg's address and decimals are needed to sell it back. Resolved
	// from the market rather than stored on the position: an address snapshotted
	// at open would keep pointing at a token the registry has since corrected.
	const { data: market } = useBasisMarket(data?.position.tokenSymbol);

	if (isLoading) return <Skeleton className="h-96 w-full" />;
	if (!data) {
		return (
			<Callout tone="warning" title="Position not found">
				<Link to="/portfolio" className="font-semibold text-[var(--pon-lime)] underline">
					Back to portfolio
				</Link>
			</Callout>
		);
	}

	const { position, repairOptions } = data;
	const token = market?.spot;

	// Both statuses mean at least one leg is live without its counterpart.
	const unhedged = position.status === "ORPHANED" || position.status === "SPOT_FILLED";
	const isLive = position.status === "OPEN";

	function refresh() {
		queryClient.invalidateQueries({ queryKey: ["basis-position", id] });
		queryClient.invalidateQueries({ queryKey: ["basis-positions"] });
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
			detail: position.shares ? `${formatQuantity(position.shares, 6)} units` : "—",
		},
		{
			name: `Short — ${position.perpSymbol}`,
			open: position.perpOpenTxHash,
			close: position.perpCloseTxHash,
			detail: `${formatUsd(position.perpCollateralUsd)} margin at ${position.perpLeverage}x`,
		},
	];

	return (
		<div className="space-y-6">
			<Link
				to="/portfolio"
				className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--pon-line-2)] px-3.5 py-1.5 text-[13px] text-[var(--pon-fg-2)] transition-colors hover:border-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]"
			>
				<ArrowLeft size={14} aria-hidden /> Portfolio
			</Link>

			<PageHeader
				eyebrow="Basis position"
				title={
					<>
						{position.tokenSymbol} <span className="text-[var(--pon-fg-3)]">/</span>{" "}
						{position.perpSymbol}
					</>
				}
				description={`Opened ${new Date(position.createdAt).toLocaleString()}`}
			/>

			{/*
			  The whole point of tracking these positions: a half-open one is
			  directional exposure the user did not choose. It gets the loudest
			  treatment on the page, with the concrete exposure named.
			*/}
			{unhedged && (
				<Callout tone="danger" title="This position is not hedged">
					<div className="space-y-3">
						<p>
							{position.spotBuyTxHash && !position.perpOpenTxHash
								? `You are holding ${position.shares ? formatQuantity(position.shares, 4) : ""} ${position.tokenSymbol} with no short against it — you are fully exposed to the price of ${position.perpSymbol}.`
								: `A short on ${position.perpSymbol} is open with no spot position hedging it.`}
						</p>
						{position.failureReason && (
							<p className="font-fono rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-2.5 t-micro text-[var(--pon-fg-2)]">
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
									variant={option.action === "retry_perp" ? "default" : "secondary"}
									title={option.description}
								>
									{option.label}
								</Button>
							))}
						</div>
						{repairOptions[0] && (
							<p className="t-caption text-[var(--pon-fg-3)]">{repairOptions[0].description}</p>
						)}
					</div>
				</Callout>
			)}

			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				<StatCard label="Notional per leg" value={formatUsd(position.notionalUsd)} />
				<StatCard
					label="Capital deployed"
					value={formatUsd((position.spotCostUsd ?? 0) + position.perpCollateralUsd)}
				/>
				<StatCard
					label="Entry funding"
					value={
						position.entryFundingRatePct !== null
							? formatFundingApr(position.entryFundingRatePct)
							: "—"
					}
					delta="APR, short side"
					tone={toneForValue(position.entryFundingRatePct ?? 0)}
				/>
				<StatCard
					label="Entry net APY"
					value={position.entryNetApyPct !== null ? formatPercent(position.entryNetApyPct) : "—"}
					tone={toneForValue(position.entryNetApyPct ?? 0)}
				/>
			</div>

			<section className="space-y-3">
				<SubHeading title="Legs" />
				<div className="space-y-2">
					{legs.map((leg) => (
						<div
							key={leg.name}
							className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4"
						>
							<div>
								<p className="text-[14px] font-semibold text-[var(--pon-fg)]">{leg.name}</p>
								<p className="mt-0.5 t-caption text-[var(--pon-fg-3)]">{leg.detail}</p>
							</div>
							<div className="flex items-center gap-3 t-caption">
								<span
									className={
										leg.open
											? "rounded-[var(--pon-r-sm)] border border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--pon-lime)]"
											: "rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] bg-[var(--pon-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--pon-fg-3)]"
									}
								>
									{leg.close ? "closed" : leg.open ? "open" : "not opened"}
								</span>
								{leg.open && (
									<a
										href={basescanTx(leg.open)}
										target="_blank"
										rel="noreferrer"
										className="font-fono inline-flex items-center gap-1 text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-lime)]"
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
				<div className="rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
					<h2 className="pon-section-label mb-2.5">Unwind</h2>
					<p className="mb-4 text-[13px] leading-relaxed text-[var(--pon-fg-2)]">
						Sells the spot leg and closes the short. Both must complete — if one fails the position
						returns here for repair rather than being left half-closed.
					</p>
					<Button
						type="button"
						onClick={runUnwind}
						variant="secondary"
						disabled={flow.isBusy || !token}
					>
						{flow.isBusy ? "Unwinding…" : "Unwind position"}
					</Button>
				</div>
			)}
		</div>
	);
}
