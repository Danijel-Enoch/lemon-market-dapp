import { Callout } from "@app/components/common/Callout";
import { DetailRow } from "@app/components/pons/Feed";
import { StatCard, toneForValue } from "@app/components/pons/StatCard";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Slider } from "@app/components/ui/slider";
import { useCarryFlow } from "@app/hooks/useCarryFlow";
import { useCarryCandidates, useSpotTokens } from "@app/hooks/useMarketData";
import { carryApi } from "@app/lib/api";
import { formatFundingApr, formatPercent, formatUsd } from "@lemon/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

const STEP_LABELS: Record<string, string> = {
	creating: "Preparing…",
	buying_spot: "Buying spot — confirm in wallet",
	opening_short: "Opening the short — sign to hedge",
	done: "Done",
};

export function CarryBuilder() {
	const { isConnected } = useConnection();
	const queryClient = useQueryClient();
	const { data: candidates } = useCarryCandidates();
	const { data: spotTokens } = useSpotTokens();
	const flow = useCarryFlow();

	const [symbol, setSymbol] = useState<string>("");
	const [notional, setNotional] = useState("1000");
	const [leverage, setLeverage] = useState(2);

	const selected =
		candidates?.candidates.find((candidate) => candidate.symbol === symbol) ??
		candidates?.candidates[0];
	const activeSymbol = selected?.symbol;

	const notionalValue = Number(notional) || 0;

	const { data: plan, isFetching: planning } = useQuery({
		queryKey: ["carry-plan", activeSymbol, notionalValue, leverage],
		queryFn: () =>
			carryApi.plan({
				symbol: activeSymbol as string,
				notionalUsd: notionalValue,
				perpLeverage: leverage,
			}),
		enabled: Boolean(activeSymbol) && notionalValue > 0,
		refetchInterval: 30_000,
	});

	async function handleOpen() {
		const token = spotTokens?.tokens.find((candidate) => candidate.symbol === activeSymbol);
		if (!token || !selected) return;

		try {
			await flow.open({
				token,
				marketSymbol: selected.marketSymbol,
				notionalUsd: notionalValue,
				perpLeverage: leverage,
			});
			toast.success("Cash-and-carry opened — both legs are live.");
			queryClient.invalidateQueries({ queryKey: ["carry-positions"] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not open the position");
		}
	}

	if (!candidates?.candidates.length) {
		return (
			<Callout tone="warning" title="No carry pairs available">
				A cash-and-carry needs both a spot buy route and a listed perp on the same underlying. None
				of the tokenized stocks currently have a buy route on Base.
			</Callout>
		);
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
			<div className="space-y-4">
				<div className="space-y-2">
					<Label>Underlying</Label>
					<div className="flex flex-wrap gap-2">
						{candidates.candidates.map((candidate) => (
							<button
								key={candidate.symbol}
								type="button"
								onClick={() => setSymbol(candidate.symbol)}
								className={
									candidate.symbol === activeSymbol
										? "rounded-full border border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pon-lime)]"
										: "rounded-full border border-[var(--pon-line)] px-3.5 py-2 text-[13px] text-[var(--pon-fg-2)] transition-colors hover:border-[var(--pon-fg-3)]"
								}
							>
								{candidate.symbol}
								<span className="ml-1.5 t-micro text-[var(--pon-fg-3)]">
									{candidate.marketSymbol}
								</span>
							</button>
						))}
					</div>
				</div>

				{candidates.unavailable.length > 0 && (
					<p className="t-caption text-[var(--pon-fg-4)]">
						Not available: {candidates.unavailable.map((item) => item.symbol).join(", ")} — no spot
						buy route yet.
					</p>
				)}

				{plan && (
					<>
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
							<StatCard
								label="Net APY"
								value={formatPercent(plan.plan.netApyPercent)}
								delta="after all costs"
								tone={toneForValue(plan.plan.netApyPercent)}
							/>
							<StatCard
								label="Funding APY"
								value={formatPercent(plan.plan.fundingApyPercent)}
								delta="before costs"
								tone={toneForValue(plan.plan.fundingApyPercent)}
							/>
							<StatCard
								label="Capital needed"
								value={formatUsd(plan.plan.totalCapitalUsd)}
								delta="spot + margin"
							/>
							<StatCard
								label="Round-trip cost"
								value={formatUsd(plan.plan.roundTripCostUsd)}
								delta="in and out"
							/>
						</div>

						<div className="rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
							<h3 className="pon-section-label mb-3">Position structure</h3>
							<dl>
								<DetailRow
									label={`Buy ${plan.tokenSymbol} spot`}
									value={formatUsd(plan.plan.spotCostUsd)}
								/>
								<DetailRow
									label={`Short ${plan.marketSymbol} @ ${plan.plan.perpLeverage}x`}
									value={`${formatUsd(plan.plan.perpCollateralUsd)} margin`}
								/>
								<div className="mt-1.5 border-t border-[var(--pon-line)] pt-1.5">
									<DetailRow label="Net exposure" value="$0 — delta neutral" tone="positive" />
								</div>
								<DetailRow
									label="Funding, short side (APR)"
									value={formatFundingApr(plan.plan.netFundingPerHourPercent)}
									tone={plan.plan.netFundingPerHourPercent >= 0 ? "positive" : "negative"}
								/>
								{plan.plan.breakevenHours !== null && (
									<DetailRow
										label="Breakeven"
										value={
											plan.plan.breakevenHours < 48
												? `${Math.round(plan.plan.breakevenHours)} hours`
												: `${Math.round(plan.plan.breakevenHours / 24)} days`
										}
									/>
								)}
							</dl>
						</div>

						{/*
						  The warnings are the point, not decoration. A carry with
						  negative funding pays to exist, and users must see that
						  before signing rather than discover it on the position card.
						*/}
						{plan.plan.warnings.map((warning) => (
							<Callout key={warning} tone={plan.plan.netApyPercent < 0 ? "danger" : "warning"}>
								{warning}
							</Callout>
						))}

						{plan.blockers.map((blocker) => (
							<Callout key={blocker} tone="danger" title="Cannot open">
								{blocker}
							</Callout>
						))}
					</>
				)}
			</div>

			<aside className="space-y-4 rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-5 lg:sticky lg:top-[92px] lg:self-start">
				<div className="space-y-2">
					<Label htmlFor="notional">Notional per leg (USDC)</Label>
					<Input
						id="notional"
						inputMode="decimal"
						value={notional}
						onChange={(event) => setNotional(event.target.value)}
					/>
					{selected && notionalValue < selected.minPositionUsdc && (
						<p className="text-xs text-[var(--pon-amber)]">
							Minimum {formatUsd(selected.minPositionUsdc)} for {selected.marketSymbol}.
						</p>
					)}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="carry-lev">Short leverage</Label>
						<span className="font-fono text-sm font-semibold text-[var(--pon-lime)]">
							{leverage}x
						</span>
					</div>
					<Slider
						id="carry-lev"
						min={1}
						max={selected?.maxLeverage ?? 5}
						step={1}
						value={[leverage]}
						onValueChange={([value]) => setLeverage(value)}
					/>
					<p className="t-micro text-[var(--pon-fg-4)]">
						Higher leverage frees up capital but moves the liquidation price closer.
					</p>
				</div>

				{flow.isBusy && (
					<Callout tone="info" title={STEP_LABELS[flow.state.step] ?? "Working…"}>
						Both legs must complete. Do not close this tab until the short is confirmed.
					</Callout>
				)}

				{flow.state.orphaned && (
					<Callout tone="danger" title="Position needs attention">
						One leg landed and the other did not — you are holding unhedged exposure. Open the
						position from the list below to repair or unwind it.
					</Callout>
				)}

				<Button
					type="button"
					onClick={handleOpen}
					disabled={
						!isConnected ||
						flow.isBusy ||
						planning ||
						!plan?.buyable ||
						(plan?.blockers.length ?? 0) > 0
					}
					size="lg"
					className="w-full rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] font-bold text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]"
				>
					{!isConnected
						? "Connect wallet"
						: flow.isBusy
							? (STEP_LABELS[flow.state.step] ?? "Working…")
							: "Open cash & carry"}
				</Button>

				<p className="text-center t-micro text-[var(--pon-fg-4)]">
					One wallet signature for the spot buy. The hedging short is placed for you.
				</p>
			</aside>
		</div>
	);
}
