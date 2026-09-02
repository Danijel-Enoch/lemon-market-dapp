import { usePerpTrade } from "@app/hooks/usePerpTrade";
import { useSpotSwap } from "@app/hooks/useSpotSwap";
import { type CarryPositionRecord, carryApi, perpApi } from "@app/lib/api";
import type { SpotTokenInfo } from "@lemon/core";
import { fromBaseUnits } from "@lemon/core";
import { useCallback, useState } from "react";
import { useConnection } from "wagmi";

export type CarryStep =
	| "idle"
	| "creating"
	| "buying_spot"
	| "opening_short"
	| "selling_spot"
	| "closing_short"
	| "done";

export interface CarryFlowState {
	step: CarryStep;
	positionId: string | null;
	/** Set when one leg landed and its counterpart failed. */
	orphaned: boolean;
	error: string | null;
}

const INITIAL: CarryFlowState = { step: "idle", positionId: null, orphaned: false, error: null };

/**
 * Drives a cash-and-carry open and unwind across its two legs.
 *
 * The legs execute against separate systems with no shared transaction, so the
 * server is told the outcome of each one *before* the next is attempted. If the
 * process dies midway — closed tab, dropped connection, rejected signature —
 * the persisted row still records exactly which legs are live, and the position
 * shows up under "needs attention" rather than disappearing.
 *
 * Spot executes first deliberately: it is the slower, failure-prone leg (an
 * on-chain swap through thin pools), so discovering its failure before any perp
 * exposure exists is cheaper than the reverse.
 */
export function useCarryFlow() {
	const { address } = useConnection();
	const spot = useSpotSwap();
	const perp = usePerpTrade();
	const [state, setState] = useState<CarryFlowState>(INITIAL);

	const reset = useCallback(() => setState(INITIAL), []);

	/**
	 * Locate the perp trade slot that was just opened.
	 *
	 * The fill is asynchronous — the operator submits after the intent is
	 * accepted — so the position may not be readable immediately. Without the
	 * trade index and open timestamp the short cannot later be closed, which is
	 * why this retries rather than giving up on the first empty read.
	 */
	const findOpenedTrade = useCallback(
		async (pairIndex: number, attempts = 6) => {
			if (!address) return null;
			for (let attempt = 0; attempt < attempts; attempt++) {
				const { positions } = await perpApi.positions(address);
				const match = positions
					.filter((position) => position.pairIndex === pairIndex && position.side === "short")
					.sort((a, b) => b.openTimestamp - a.openTimestamp)[0];
				if (match) return match;
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			}
			return null;
		},
		[address],
	);

	const open = useCallback(
		async (params: {
			token: SpotTokenInfo;
			marketSymbol: string;
			pairIndex: number;
			notionalUsd: number;
			perpLeverage: number;
			slippagePercent?: number;
		}): Promise<CarryPositionRecord | null> => {
			if (!address) throw new Error("Connect a wallet first.");
			setState({ ...INITIAL, step: "creating" });

			const position = await carryApi.create({
				userAddress: address,
				symbol: params.token.symbol,
				notionalUsd: params.notionalUsd,
				perpLeverage: params.perpLeverage,
			});
			setState((prev) => ({ ...prev, positionId: position.id }));

			// --- Leg 1: buy the spot token -----------------------------------
			setState((prev) => ({ ...prev, step: "buying_spot" }));
			let shares = 0;
			try {
				const outcome = await spot.swap({
					token: params.token,
					direction: "buy",
					amount: String(params.notionalUsd),
					slippagePercent: params.slippagePercent,
				});
				if (!outcome) throw new Error("Spot buy did not complete.");

				shares = Number(fromBaseUnits(outcome.amountOut, params.token.decimals));
				await carryApi.spotFilled(position.id, {
					txHash: outcome.txHash,
					shares,
					spotCostUsd: params.notionalUsd,
				});
			} catch (cause) {
				// Nothing landed on-chain, so this is terminal rather than orphaned.
				const message = cause instanceof Error ? cause.message : "Spot buy failed";
				await carryApi.legFailed(position.id, { leg: "SPOT", error: message });
				setState((prev) => ({ ...prev, step: "idle", error: message }));
				throw cause;
			}

			// --- Leg 2: short the perp ---------------------------------------
			// From here the user holds unhedged spot until this succeeds.
			setState((prev) => ({ ...prev, step: "opening_short" }));
			try {
				await perp.open({
					symbol: params.marketSymbol,
					side: "short",
					collateralUsdc: params.notionalUsd / params.perpLeverage,
					leverage: params.perpLeverage,
					orderType: "market",
					slippagePercent: params.slippagePercent,
				});

				const trade = await findOpenedTrade(params.pairIndex);
				if (!trade) {
					throw new Error(
						"The short was submitted but has not appeared on-chain yet. Check the position before opening another.",
					);
				}

				const updated = await carryApi.perpOpened(position.id, {
					tradeIndex: trade.index,
					openTimestamp: trade.openTimestamp,
				});
				setState((prev) => ({ ...prev, step: "done" }));
				return updated;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Short leg failed";
				await carryApi.legFailed(position.id, { leg: "PERP", error: message });
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[address, findOpenedTrade, perp, spot],
	);

	/** Complete the missing short on an orphaned position. */
	const repairShort = useCallback(
		async (position: CarryPositionRecord) => {
			setState({ ...INITIAL, positionId: position.id, step: "opening_short" });
			try {
				await perp.open({
					symbol: position.avantisSymbol,
					side: "short",
					collateralUsdc: position.perpCollateralUsd,
					leverage: position.perpLeverage,
					orderType: "market",
				});
				const trade = await findOpenedTrade(position.avantisPairIndex);
				if (!trade) throw new Error("Short not yet visible on-chain — try again shortly.");

				const updated = await carryApi.perpOpened(position.id, {
					tradeIndex: trade.index,
					openTimestamp: trade.openTimestamp,
				});
				setState((prev) => ({ ...prev, step: "done", orphaned: false }));
				return updated;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Repair failed";
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[findOpenedTrade, perp],
	);

	const unwind = useCallback(
		async (position: CarryPositionRecord, token: SpotTokenInfo) => {
			setState({ ...INITIAL, positionId: position.id, step: "selling_spot" });
			await carryApi.unwind(position.id);

			// --- Leg 1: sell the spot back to USDC ---------------------------
			if (position.shares && !position.spotSellTxHash) {
				try {
					const outcome = await spot.swap({
						token,
						direction: "sell",
						amount: String(position.shares),
					});
					if (!outcome) throw new Error("Spot sell did not complete.");
					await carryApi.spotClosed(position.id, {
						txHash: outcome.txHash,
						proceedsUsd: 0,
					});
				} catch (cause) {
					const message = cause instanceof Error ? cause.message : "Spot sell failed";
					await carryApi.legFailed(position.id, { leg: "SPOT", error: message });
					setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
					throw cause;
				}
			}

			// --- Leg 2: close the short --------------------------------------
			setState((prev) => ({ ...prev, step: "closing_short" }));
			try {
				if (position.perpTradeIndex !== null) {
					await perp.close({
						pairIndex: position.avantisPairIndex,
						index: position.perpTradeIndex,
						collateralToCloseUsdc: position.perpCollateralUsd,
					});
				}
				const closed = await carryApi.closed(position.id, {});
				setState((prev) => ({ ...prev, step: "done" }));
				return closed;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Closing the short failed";
				await carryApi.legFailed(position.id, { leg: "PERP", error: message });
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[perp, spot],
	);

	/** Sell the spot leg of an orphan and close the position out. */
	const unwindSpotOnly = useCallback(
		async (position: CarryPositionRecord, token: SpotTokenInfo) => {
			setState({ ...INITIAL, positionId: position.id, step: "selling_spot" });
			try {
				const outcome = await spot.swap({
					token,
					direction: "sell",
					amount: String(position.shares ?? 0),
				});
				if (!outcome) throw new Error("Spot sell did not complete.");
				await carryApi.spotClosed(position.id, { txHash: outcome.txHash, proceedsUsd: 0 });
				const closed = await carryApi.closed(position.id, {});
				setState((prev) => ({ ...prev, step: "done", orphaned: false }));
				return closed;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Spot sell failed";
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[spot],
	);

	return {
		state,
		reset,
		open,
		unwind,
		repairShort,
		unwindSpotOnly,
		isBusy: state.step !== "idle" && state.step !== "done",
		spotStage: spot.stage,
		perpStage: perp.stage,
	};
}
