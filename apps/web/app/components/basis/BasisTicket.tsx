import { Callout } from "@app/components/common/Callout";
import { DetailRow } from "@app/components/common/DetailRow";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Slider } from "@app/components/ui/slider";
import { useBasisFlow } from "@app/hooks/useBasisFlow";
import { basisApi } from "@app/lib/api";
import type { BasisMarket } from "@lemon/core";
import { formatFundingApr, formatPercent, formatUsd } from "@lemon/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

const STEP_LABELS: Record<string, string> = {
	creating: "Preparing…",
	buying_spot: "Buying spot — confirm in wallet",
	opening_short: "Opening the short — hedging now",
	done: "Done",
};

/**
 * Open a position in one market.
 *
 * The plan is re-quoted at the size actually typed, never scaled from the
 * board's reference row. Slippage is not linear in size, so a market that looks
 * good at $10k can be uneconomic at $200k — and a ticket that extrapolated the
 * row would quote a yield the fill cannot deliver.
 */
export function BasisTicket({ market }: { market: BasisMarket }) {
	const { isConnected } = useConnection();
	const queryClient = useQueryClient();
	const flow = useBasisFlow();

	const [notional, setNotional] = useState("1000");
	const [leverage, setLeverage] = useState(2);

	const notionalValue = Number(notional) || 0;

	const { data: quoted, isFetching: planning } = useQuery({
		queryKey: ["basis-plan", market.id, notionalValue, leverage],
		queryFn: () =>
			basisApi.plan({
				symbol: market.id,
				notionalUsd: notionalValue,
				perpLeverage: leverage,
			}),
		enabled: notionalValue > 0,
		refetchInterval: 30_000,
	});

	const plan = quoted?.plan;

	async function handleOpen() {
		try {
			await flow.open({
				token: market.spot,
				marketSymbol: market.perp.symbol,
				notionalUsd: notionalValue,
				perpLeverage: leverage,
			});
			toast.success(`${market.ticker} position opened — both legs are live.`);
			queryClient.invalidateQueries({ queryKey: ["basis-positions"] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not open the position");
		}
	}

	const blocked = (quoted?.blockers.length ?? market.blockers.length) > 0;
	const blockers = quoted?.blockers ?? market.blockers;

	return (
		<div className="space-y-4 rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-5">
			<div>
				<h2 className="font-display text-[16px] font-bold text-[var(--pon-fg)]">Open a position</h2>
				<p className="mt-1 t-micro text-[var(--pon-fg-3)]">
					Long {market.spot.symbol} spot, short {market.perp.symbol} at equal notional.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="notional">Notional per leg (USDC)</Label>
				<Input
					id="notional"
					inputMode="decimal"
					value={notional}
					onChange={(event) => setNotional(event.target.value)}
				/>
				{notionalValue > 0 && notionalValue < market.perp.minPositionUsdc && (
					<p className="text-xs text-[var(--pon-amber)]">
						Minimum {formatUsd(market.perp.minPositionUsdc)} for {market.perp.symbol}.
					</p>
				)}
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="basis-lev">Short leverage</Label>
					<span className="font-fono text-sm font-semibold text-[var(--pon-lime)]">
						{leverage}x
					</span>
				</div>
				<Slider
					id="basis-lev"
					min={1}
					max={market.perp.maxLeverage}
					step={1}
					value={[leverage]}
					onValueChange={([value]) => setLeverage(value)}
				/>
				<p className="t-micro text-[var(--pon-fg-4)]">
					Higher leverage frees capital but moves the liquidation price closer to the mark.
				</p>
			</div>

			{plan && (
				<dl className="border-t border-[var(--pon-line)] pt-3">
					<DetailRow label={`Buy ${market.spot.symbol}`} value={formatUsd(plan.spotCostUsd)} />
					<DetailRow
						label={`Short ${market.perp.symbol} @ ${plan.perpLeverage}x`}
						value={`${formatUsd(plan.perpCollateralUsd)} margin`}
					/>
					<DetailRow label="Capital needed" value={formatUsd(plan.totalCapitalUsd)} />
					<div className="mt-1.5 border-t border-[var(--pon-line)] pt-1.5">
						<DetailRow label="Net exposure" value="$0 — delta neutral" tone="positive" />
					</div>
					<DetailRow
						label="Funding, short side"
						value={formatFundingApr(plan.netFundingPerHourPercent)}
						tone={plan.netFundingPerHourPercent >= 0 ? "positive" : "negative"}
					/>
					<DetailRow
						label="Round trip"
						value={`${formatUsd(plan.roundTripCostUsd)} (${plan.roundTripCostPercent.toFixed(2)}%)`}
					/>
					<DetailRow
						label="Net APY"
						value={formatPercent(plan.netApyPercent)}
						tone={plan.netApyPercent >= 0 ? "positive" : "negative"}
					/>
					{plan.breakevenHours !== null && (
						<DetailRow
							label="Breakeven"
							value={
								plan.breakevenHours < 48
									? `${Math.round(plan.breakevenHours)} hours`
									: `${Math.round(plan.breakevenHours / 24)} days`
							}
						/>
					)}
				</dl>
			)}

			{/*
			  The warnings are the point, not decoration. A position with negative
			  funding pays to exist, and that has to be visible before signing
			  rather than discovered later on the position card.
			*/}
			{plan?.warnings.map((warning) => (
				<Callout key={warning} tone={plan.netApyPercent < 0 ? "danger" : "warning"}>
					{warning}
				</Callout>
			))}

			{blockers.map((blocker) => (
				<Callout key={blocker} tone="danger" title="Cannot open">
					{blocker}
				</Callout>
			))}

			{flow.isBusy && (
				<Callout tone="info" title={STEP_LABELS[flow.state.step] ?? "Working…"}>
					Both legs must complete. Do not close this tab until the short is confirmed.
				</Callout>
			)}

			{flow.state.orphaned && (
				<Callout tone="danger" title="Position needs attention">
					One leg landed and the other did not — you are holding unhedged exposure. Open it from
					your portfolio to repair or unwind it.
				</Callout>
			)}

			<Button
				type="button"
				onClick={handleOpen}
				disabled={
					!isConnected ||
					flow.isBusy ||
					planning ||
					blocked ||
					!quoted?.buyable ||
					notionalValue <= 0
				}
				size="lg"
				className="w-full rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] font-bold text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]"
			>
				{!isConnected
					? "Connect wallet"
					: flow.isBusy
						? (STEP_LABELS[flow.state.step] ?? "Working…")
						: `Open ${market.ticker} basis`}
			</Button>

			<p className="text-center t-micro text-[var(--pon-fg-4)]">
				One wallet signature, for the spot buy. The hedging short is placed for you.
			</p>
		</div>
	);
}
