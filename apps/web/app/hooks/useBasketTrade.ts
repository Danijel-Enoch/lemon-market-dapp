import { useCarryFlow } from "@app/hooks/useCarryFlow";
import { useMarkets } from "@app/hooks/useMarketData";
import { sizeForNotional, usePacificaTrade } from "@app/hooks/usePacificaTrade";
import { useSpotSwap } from "@app/hooks/useSpotSwap";
import type { BasketPlan } from "@app/lib/api";
import type { SpotTokenInfo } from "@lemon/core";
import { useCallback, useState } from "react";

export type LegState = "pending" | "running" | "filled" | "failed" | "skipped";

export interface LegProgress {
	ticker: string;
	state: LegState;
	txHash?: string;
	error?: string;
}

/**
 * Execute a basket entry leg by leg.
 *
 * There is no atomic multi-market order across Pacifica and KyberSwap, so a
 * basket is genuinely N independent trades. Legs run sequentially and each
 * records its own outcome, because the realistic failure here is a *partial*
 * basket — a wallet rejection or a stalled route halfway through — and the user
 * needs to see exactly which legs they now hold rather than a single
 * "something failed" toast for the whole entry.
 *
 * A failed leg does not abort the rest: the remaining legs are still worth
 * entering, and stopping early would leave an even more lopsided basket.
 */
export function useBasketTrade() {
	const perp = usePacificaTrade();
	const { data: catalog } = useMarkets();
	const spot = useSpotSwap();
	const carry = useCarryFlow();
	const [progress, setProgress] = useState<LegProgress[]>([]);
	const [running, setRunning] = useState(false);

	const reset = useCallback(() => setProgress([]), []);

	const update = useCallback((ticker: string, patch: Partial<LegProgress>) => {
		setProgress((current) =>
			current.map((leg) => (leg.ticker === ticker ? { ...leg, ...patch } : leg)),
		);
	}, []);

	/**
	 * Open a cash-and-carry on every leg that has both a spot route and a perp.
	 *
	 * Each leg is a full two-leg carry, so this is N x 2 transactions and reuses
	 * the single-market carry flow — including its orphan handling, which
	 * matters more here: a basket multiplies the chance that at least one leg
	 * ends up half-open.
	 */
	const executeCarry = useCallback(
		async (params: {
			plan: BasketPlan;
			legs: {
				ticker: string;
				marketSymbol: string;
				spotSymbol: string | null;
			}[];
			leverage: number;
			tokens?: SpotTokenInfo[];
		}) => {
			setRunning(true);
			const eligible = params.legs.filter((leg) => leg.spotSymbol);
			setProgress(
				params.legs.map((leg) => ({
					ticker: leg.ticker,
					state: eligible.includes(leg) ? "pending" : "skipped",
					error: eligible.includes(leg) ? undefined : "no spot leg",
				})),
			);

			const perLeg = params.plan.effectiveUsd / Math.max(1, eligible.length);
			let filled = 0;

			for (const leg of eligible) {
				update(leg.ticker, { state: "running" });
				const token = params.tokens?.find((candidate) => candidate.symbol === leg.spotSymbol);
				if (!token) {
					update(leg.ticker, { state: "failed", error: "Spot token unavailable" });
					continue;
				}
				try {
					await carry.open({
						token,
						marketSymbol: leg.marketSymbol,
						notionalUsd: perLeg,
						perpLeverage: params.leverage,
					});
					update(leg.ticker, { state: "filled" });
					filled++;
				} catch (cause) {
					update(leg.ticker, {
						state: "failed",
						error: cause instanceof Error ? cause.message : "Carry failed",
					});
				}
			}

			setRunning(false);
			return { filled, total: eligible.length };
		},
		[carry, update],
	);

	const execute = useCallback(
		async (params: {
			plan: BasketPlan;
			side?: "long" | "short";
			leverage?: number;
			/** Needed for spot legs; keyed by token symbol. */
			tokens?: SpotTokenInfo[];
		}) => {
			setRunning(true);
			setProgress(
				params.plan.legs.map((leg) => ({
					ticker: leg.ticker,
					state: leg.tradable ? "pending" : "skipped",
					error: leg.reason ?? undefined,
				})),
			);

			let filled = 0;
			for (const leg of params.plan.legs) {
				if (!leg.tradable) continue;
				update(leg.ticker, { state: "running" });

				try {
					if (params.plan.venue === "perp") {
						const leverage = params.leverage ?? params.plan.leverage;
						const market = catalog?.markets.find(
							(candidate) => candidate.symbol === leg.marketSymbol,
						);
						if (!market) throw new Error(`No market data for ${leg.marketSymbol}`);

						const amount = sizeForNotional(market, leg.notionalUsd);
						if (!amount) {
							throw new Error(`${leg.ticker} allocation is below one lot on this market`);
						}

						await perp.place({
							symbol: leg.marketSymbol,
							side: (params.side ?? "long") === "long" ? "bid" : "ask",
							amount,
							orderType: "market",
							leverage,
						});
						update(leg.ticker, { state: "filled" });
					} else {
						const token = params.tokens?.find((candidate) => candidate.symbol === leg.spotSymbol);
						if (!token) throw new Error(`No spot token for ${leg.ticker}`);

						const outcome = await spot.swap({
							token,
							direction: "buy",
							amount: String(leg.notionalUsd),
						});
						update(leg.ticker, {
							state: "filled",
							txHash: outcome?.txHash,
						});
					}
					filled++;
				} catch (cause) {
					update(leg.ticker, {
						state: "failed",
						error: cause instanceof Error ? cause.message : "Leg failed",
					});
				}
			}

			setRunning(false);
			return { filled, total: params.plan.tradableLegs };
		},
		[catalog, perp, spot, update],
	);

	return { execute, executeCarry, progress, running, reset };
}
