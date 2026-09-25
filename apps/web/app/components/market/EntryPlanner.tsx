import { OpenPosition } from "@app/components/market/OpenPosition";
import type { BasisMarket, UserBalances } from "@lemon/client";
import { formatPercent } from "@lemon/client";
import { Callout, cn, DetailRow } from "@lemon/ui";
import { useMemo, useState } from "react";

/**
 * The sizing panel.
 *
 * Its job is to answer, before any money moves, the four questions that decide
 * whether a basis position is worth opening: what it costs to get in, what it
 * pays, when it turns a profit, and where it breaks. The board ranks markets;
 * this prices one.
 *
 * Every figure is computed from the size actually typed rather than from the
 * board's reference notional. That difference is the whole reason this exists —
 * the board quotes every market at one size so rows compare, and a position
 * sized differently has different slippage, a different margin requirement and a
 * different breakeven. Ranking numbers presented as commitment numbers is how
 * someone opens a $200 position expecting the APY quoted for a $50,000 one.
 *
 * ## Why capital is split into two figures
 *
 * A basis position needs money in two places at once, and they are not
 * interchangeable. The spot leg is bought with USDC in the user's own wallet, on
 * Base or X Layer. The margin has to be on Pacifica, which means bridging to
 * Solana first — minutes, not seconds. Quoting one combined "you need $X" number
 * would be arithmetically true and operationally useless: someone with the full
 * amount entirely on Base still cannot open the position today.
 */

/**
 * What entering and exiting costs, as a fraction of notional.
 *
 * Taken from the market's own measured round trip rather than assumed, because
 * the dominant term is pool slippage and that is a property of the specific
 * market — a figure hardcoded here would be wrong by an order of magnitude
 * across the board's range.
 */
function roundTripCost(market: BasisMarket, notional: number): number {
	return notional * (market.economics.roundTripCostPercent / 100);
}

export interface EntryPlan {
	notional: number;
	/** USDC needed in the connected wallet to buy the spot leg. */
	spotCapital: number;
	/** USDC needed on Pacifica to back the short. */
	margin: number;
	/** Both, which is the number someone budgets against. */
	totalCapital: number;
	fundingPerDay: number;
	roundTrip: number;
	breakevenDays: number | null;
	/** Null at 1x, where a fully collateralised short cannot be liquidated. */
	liquidationPrice: number | null;
	/** Everything that would stop this specific size being accepted. */
	problems: string[];
}

/**
 * Price one position at one size.
 *
 * Exported and pure so the arithmetic can be asserted without rendering
 * anything — this is the part of the page that must not be quietly wrong.
 */
export function planEntry(params: {
	market: BasisMarket;
	notional: number;
	leverage: number;
	balances?: UserBalances;
}): EntryPlan {
	const { market, notional, leverage } = params;

	const margin = leverage > 0 ? notional / leverage : notional;
	const spotCapital = notional;
	const roundTrip = roundTripCost(market, notional);

	// Funding is quoted per hour on the short side and accrues on notional, not
	// on margin — leverage multiplies the yield on capital precisely because the
	// notional stays the same while the margin behind it shrinks.
	const fundingPerDay = notional * (market.economics.fundingShortPercentPerHour / 100) * 24;

	const breakevenDays = fundingPerDay > 0 ? roundTrip / fundingPerDay : null;

	// A short is liquidated as the price rises. The venue's real trigger is a
	// maintenance margin rather than zero equity, so this is optimistic and the
	// panel says so.
	const liquidationPrice =
		leverage <= 1 || market.perp.markPrice === null
			? null
			: market.perp.markPrice * (1 + 1 / leverage);

	const problems: string[] = [];

	if (notional < market.perp.minPositionUsdc) {
		problems.push(
			`Pacifica's minimum position in ${market.ticker} is $${market.perp.minPositionUsdc}. A smaller short is rejected by the venue, which would leave the spot leg unhedged.`,
		);
	}

	if (leverage > market.perp.maxLeverage) {
		problems.push(`${market.ticker} allows at most ${market.perp.maxLeverage}x on Pacifica.`);
	}

	if (params.balances) {
		const { minimums, pacifica } = params.balances;
		if (margin < minimums.depositUsdc) {
			problems.push(
				`Pacifica rejects deposits below $${minimums.depositUsdc}, and this size needs only $${margin.toFixed(2)} of margin. Either size up, or use less leverage so more capital sits as margin.`,
			);
		}

		const available = pacifica.availableUsdc === null ? 0 : Number(pacifica.availableUsdc) / 1e6;
		if (available < margin) {
			problems.push(
				`This needs $${margin.toFixed(2)} of margin on Pacifica and $${available.toFixed(2)} is available there. Bridging USDC across takes a few minutes, so start it before you buy the spot leg.`,
			);
		}
	}

	if (market.economics.fundingShortPercentPerHour <= 0) {
		problems.push(
			"Short-side funding is negative right now, so this position would pay funding rather than collect it. The basis can still converge in your favour, but the yield leg is working against you.",
		);
	}

	return {
		notional,
		spotCapital,
		margin,
		totalCapital: spotCapital + margin,
		fundingPerDay,
		roundTrip,
		breakevenDays,
		liquidationPrice,
		problems,
	};
}

const SIZE_PRESETS = [100, 500, 1_000, 5_000];

export function EntryPlanner({
	market,
	balances,
}: {
	market: BasisMarket;
	balances?: UserBalances;
}) {
	const [notionalInput, setNotionalInput] = useState("1000");
	const [leverage, setLeverage] = useState(1);

	const notional = Number(notionalInput) || 0;

	const plan = useMemo(
		() => planEntry({ market, notional, leverage, balances }),
		[market, notional, leverage, balances],
	);

	// Yield on capital actually committed, which is the only return figure worth
	// comparing against anything else someone could do with the money.
	const apyOnCapital =
		plan.totalCapital > 0 ? ((plan.fundingPerDay * 365) / plan.totalCapital) * 100 : 0;

	/**
	 * The subset of problems that make the trade impossible rather than unwise.
	 *
	 * Funding being negative is a reason to think twice and someone may still
	 * want the basis convergence; a size under the venue's minimum, or margin
	 * that is not there, is a short that will not be accepted — and an
	 * unaccepted short against a bought spot leg is an unhedged position.
	 */
	const blocking = plan.problems.filter(
		(problem) =>
			problem.includes("minimum position") ||
			problem.includes("at most") ||
			problem.includes("rejects deposits below") ||
			problem.includes("is available there"),
	);

	return (
		<div className="space-y-5 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div>
				<h2 className="firm-label text-[var(--pon-fg-0)]">Size a position</h2>
				<p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pon-fg-3)]">
					Priced at the size you type, not at the board's reference size. Nothing here commits
					anything.
				</p>
			</div>

			<div className="space-y-2">
				<label htmlFor="notional" className="firm-label block text-[var(--pon-fg-3)]">
					Position size (USD of {market.ticker})
				</label>
				<input
					id="notional"
					type="number"
					inputMode="decimal"
					min={0}
					value={notionalInput}
					onChange={(event) => setNotionalInput(event.target.value)}
					className="font-fono w-full rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-bg)] px-3 py-2.5 text-[15px] font-bold text-[var(--pon-fg)] focus:border-[var(--pon-ink)] focus:outline-none"
				/>
				<div className="flex flex-wrap gap-1.5">
					{SIZE_PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => setNotionalInput(String(preset))}
							className={cn(
								"rounded-full border px-2.5 py-1 font-fono text-[11px] transition-colors",
								notional === preset
									? "border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] text-[var(--pon-fg-0)]"
									: "border-[var(--pon-line)] text-[var(--pon-fg-3)] hover:border-[var(--pon-ink)]",
							)}
						>
							${preset.toLocaleString("en-US")}
						</button>
					))}
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-baseline justify-between">
					<label htmlFor="leverage" className="firm-label text-[var(--pon-fg-3)]">
						Leverage on the short
					</label>
					<span className="font-fono text-[13px] font-bold text-[var(--pon-fg)]">{leverage}x</span>
				</div>
				<input
					id="leverage"
					type="range"
					min={1}
					max={Math.min(market.perp.maxLeverage, 5)}
					step={1}
					value={leverage}
					onChange={(event) => setLeverage(Number(event.target.value))}
					className="w-full accent-[var(--pon-lime)]"
				/>
				<p className="text-[11px] leading-relaxed text-[var(--pon-fg-3)]">
					{leverage === 1
						? "Fully collateralised. The short cannot be liquidated at any price, which is the reason to choose 1x."
						: `Margin is ${leverage}× smaller, so the same funding earns ${leverage}× the return on capital — and a liquidation price appears. Above it, the short is closed and the spot leg is left unhedged.`}
				</p>
			</div>

			<div className="space-y-0">
				<DetailRow
					label="USDC in your wallet"
					value={`$${plan.spotCapital.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
				/>
				<DetailRow
					label="USDC on Pacifica"
					value={`$${plan.margin.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
				/>
				<DetailRow
					label="Total committed"
					value={`$${plan.totalCapital.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
				/>
				<DetailRow
					label="Funding per day"
					value={`$${plan.fundingPerDay.toFixed(2)}`}
					tone={plan.fundingPerDay > 0 ? "positive" : "negative"}
				/>
				<DetailRow
					label="Return on capital"
					value={formatPercent(apyOnCapital, 1)}
					tone={apyOnCapital > 0 ? "positive" : "negative"}
				/>
				<DetailRow label="Round trip cost" value={`$${plan.roundTrip.toFixed(2)}`} />
				<DetailRow
					label="Breakeven"
					value={
						plan.breakevenDays === null
							? "never at this rate"
							: `${plan.breakevenDays.toFixed(1)} days`
					}
				/>
				<DetailRow
					label="Liquidation"
					value={
						plan.liquidationPrice === null
							? "none at 1x"
							: `~$${plan.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
					}
					tone={plan.liquidationPrice === null ? "positive" : "neutral"}
				/>
			</div>

			{plan.liquidationPrice !== null && (
				<p className="text-[11px] leading-relaxed text-[var(--pon-fg-3)]">
					The liquidation price is an estimate and is optimistic: Pacifica closes a position at its
					maintenance margin rather than at zero equity, so the real trigger is below the figure
					shown.
				</p>
			)}

			{plan.problems.map((problem) => (
				<Callout key={problem} tone="warning">
					{problem}
				</Callout>
			))}

			{/*
			  The problems above are warnings rather than a gate, with one
			  exception. Most of them are worth reading and proceeding anyway —
			  negative funding is a judgement call, not an error — but a size the
			  venue will reject is not a judgement call: the short would bounce and
			  leave the spot leg unhedged, which is the one outcome this flow exists
			  to prevent.
			*/}
			<OpenPosition
				market={market}
				notionalUsd={notional}
				leverage={leverage}
				disabled={blocking.length > 0}
				disabledReason={blocking[0]}
			/>
		</div>
	);
}
