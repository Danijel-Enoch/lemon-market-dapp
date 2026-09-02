import { Callout } from "@app/components/common/Callout";
import { StatTile, toneForValue } from "@app/components/common/StatTile";
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
				pairIndex: selected.pairIndex,
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
										? "rounded-lg border border-lime-500/50 bg-lime-500/10 px-3 py-2 text-sm text-lime-300"
										: "rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 hover:border-white/25"
								}
							>
								{candidate.symbol}
								<span className="ml-1.5 text-[11px] text-gray-500">{candidate.marketSymbol}</span>
							</button>
						))}
					</div>
				</div>

				{candidates.unavailable.length > 0 && (
					<p className="text-xs text-gray-600">
						Not available: {candidates.unavailable.map((item) => item.symbol).join(", ")} — no spot
						buy route yet.
					</p>
				)}

				{plan && (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<StatTile
								label="Net APY"
								value={formatPercent(plan.plan.netApyPercent)}
								hint="after all costs"
								tone={toneForValue(plan.plan.netApyPercent)}
							/>
							<StatTile
								label="Funding APY"
								value={formatPercent(plan.plan.fundingApyPercent)}
								hint="before costs"
								tone={toneForValue(plan.plan.fundingApyPercent)}
							/>
							<StatTile
								label="Capital needed"
								value={formatUsd(plan.plan.totalCapitalUsd)}
								hint="spot + margin"
							/>
							<StatTile
								label="Round-trip cost"
								value={formatUsd(plan.plan.roundTripCostUsd)}
								hint="in and out"
							/>
						</div>

						<div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
							<h3 className="mb-3 font-medium">Position structure</h3>
							<dl className="space-y-2">
								<div className="flex justify-between">
									<dt className="text-gray-400">Buy {plan.tokenSymbol} spot</dt>
									<dd className="font-mono">{formatUsd(plan.plan.spotCostUsd)}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-gray-400">
										Short {plan.marketSymbol} @ {plan.plan.perpLeverage}x
									</dt>
									<dd className="font-mono">{formatUsd(plan.plan.perpCollateralUsd)} margin</dd>
								</div>
								<div className="flex justify-between border-t border-white/5 pt-2">
									<dt className="text-gray-400">Net exposure</dt>
									<dd className="font-mono text-lime-400">$0 — delta neutral</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-gray-400">Funding, short side (APR)</dt>
									<dd
										className={
											plan.plan.netFundingPerHourPercent >= 0
												? "font-mono text-lime-400"
												: "font-mono text-red-400"
										}
									>
										{formatFundingApr(plan.plan.netFundingPerHourPercent)}
									</dd>
								</div>
								{plan.plan.breakevenHours !== null && (
									<div className="flex justify-between">
										<dt className="text-gray-400">Breakeven</dt>
										<dd className="font-mono text-gray-300">
											{plan.plan.breakevenHours < 48
												? `${Math.round(plan.plan.breakevenHours)} hours`
												: `${Math.round(plan.plan.breakevenHours / 24)} days`}
										</dd>
									</div>
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

			<aside className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:sticky lg:top-28 lg:self-start">
				<div className="space-y-2">
					<Label htmlFor="notional">Notional per leg (USDC)</Label>
					<Input
						id="notional"
						inputMode="decimal"
						value={notional}
						onChange={(event) => setNotional(event.target.value)}
					/>
					{selected && notionalValue < selected.minPositionUsdc && (
						<p className="text-xs text-amber-400">
							Minimum {formatUsd(selected.minPositionUsdc)} for {selected.marketSymbol}.
						</p>
					)}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="carry-lev">Short leverage</Label>
						<span className="font-mono text-sm text-lime-400">{leverage}x</span>
					</div>
					<Slider
						id="carry-lev"
						min={1}
						max={selected?.maxLeverage ?? 5}
						step={1}
						value={[leverage]}
						onValueChange={([value]) => setLeverage(value)}
					/>
					<p className="text-[11px] text-gray-600">
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
					className="w-full bg-lime-500 font-semibold text-black hover:bg-lime-400"
				>
					{!isConnected
						? "Connect wallet"
						: flow.isBusy
							? (STEP_LABELS[flow.state.step] ?? "Working…")
							: "Open cash & carry"}
				</Button>

				<p className="text-center text-[11px] text-gray-600">
					Two transactions: a spot buy, then the hedging short.
				</p>
			</aside>
		</div>
	);
}
