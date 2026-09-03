import { useSpotSwap } from "@app/hooks/useSpotSwap";
import { type CarryPositionRecord, carryApi } from "@app/lib/api";
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
 *
 * The short leg is one server call. It used to be a wallet signature followed
 * by polling the chain for the trade slot, which is what made the unhedged
 * window wide enough to matter; the agent key closes it to a single request.
 */
export function useCarryFlow() {
	const { address } = useConnection();
	const spot = useSpotSwap();
	const [state, setState] = useState<CarryFlowState>(INITIAL);

	const reset = useCallback(() => setState(INITIAL), []);

	const open = useCallback(
		async (params: {
			token: SpotTokenInfo;
			marketSymbol: string;
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
				const updated = await carryApi.openPerp(position.id);
				setState((prev) => ({ ...prev, step: "done" }));
				return updated;
			} catch (cause) {
				// The server already recorded the failed leg, so the position is
				// findable under "needs attention" even if this tab goes away.
				const message = cause instanceof Error ? cause.message : "Short leg failed";
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[address, spot],
	);

	/** Complete the missing short on an orphaned position. */
	const repairShort = useCallback(async (position: CarryPositionRecord) => {
		setState({ ...INITIAL, positionId: position.id, step: "opening_short" });
		try {
			const updated = await carryApi.openPerp(position.id);
			setState((prev) => ({ ...prev, step: "done", orphaned: false }));
			return updated;
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : "Repair failed";
			setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
			throw cause;
		}
	}, []);

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
				const closed = await carryApi.closePerp(position.id);
				setState((prev) => ({ ...prev, step: "done" }));
				return closed;
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Closing the short failed";
				setState((prev) => ({ ...prev, step: "idle", orphaned: true, error: message }));
				throw cause;
			}
		},
		[spot],
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
	};
}
