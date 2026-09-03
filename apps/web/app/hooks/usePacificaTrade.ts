import { useRefreshAccount } from "@app/hooks/useAccount";
import { pacificaApi } from "@app/lib/api";
import { useMutation } from "@tanstack/react-query";

/**
 * Placing an order on Pacifica.
 *
 * Nothing here asks the wallet for anything. The agent key authorised during
 * onboarding signs server-side, which is the entire point of that second
 * signature: a market order is one request, not a wallet prompt and a chain
 * confirmation.
 */

export interface PacificaOrderInput {
	/** Display symbol, e.g. "BTC/USD". The server maps it to Pacifica's own. */
	symbol: string;
	side: "bid" | "ask";
	/** Size in base units of the asset, already rounded to the lot grid. */
	amount: string;
	orderType: "market" | "limit";
	/** Required for limit orders, on the market's tick grid. */
	price?: string;
	/** Percent, so "0.5" is half a percent. */
	slippagePercent?: string;
	reduceOnly?: boolean;
	/**
	 * Applied before the order when it differs from the account's current
	 * setting. Pacifica holds leverage per market on the account rather than per
	 * order, so it is a separate call and has to happen first.
	 */
	leverage?: number;
}

export function usePacificaTrade() {
	const refresh = useRefreshAccount();

	const mutation = useMutation({
		mutationFn: async (input: PacificaOrderInput) => {
			if (input.leverage) {
				// Failing here rather than proceeding: an order placed at the old
				// leverage is the wrong size of risk, silently.
				await pacificaApi.setLeverage({ symbol: input.symbol, leverage: input.leverage });
			}

			if (input.orderType === "limit") {
				if (!input.price) throw new Error("A limit order needs a price.");
				return pacificaApi.limitOrder({
					symbol: input.symbol,
					side: input.side,
					amount: input.amount,
					price: input.price,
					reduceOnly: input.reduceOnly,
				});
			}

			return pacificaApi.marketOrder({
				symbol: input.symbol,
				side: input.side,
				amount: input.amount,
				slippagePercent: input.slippagePercent ?? "0.5",
				reduceOnly: input.reduceOnly,
			});
		},
		onSuccess: refresh,
	});

	return {
		place: mutation.mutateAsync,
		isBusy: mutation.isPending,
		error: mutation.error,
	};
}

/**
 * Round a size down onto the venue's lot grid.
 *
 * Down rather than nearest: rounding up can exceed the balance the size was
 * calculated from, which turns a valid order into a rejected one at the worst
 * possible moment.
 */
export function roundToLot(amount: number, lotSize: number): number {
	if (!lotSize || lotSize <= 0) return amount;
	return Math.floor(amount / lotSize) * lotSize;
}

/** Decimal places implied by an increment, for display without float noise. */
export function decimalsFor(increment: number): number {
	if (!increment || increment >= 1) return 0;
	return Math.min(8, Math.ceil(-Math.log10(increment)));
}
