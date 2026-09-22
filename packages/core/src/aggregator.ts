import type { Address, Hex, SpotQuote } from "./types";

/**
 * The contract every spot venue implements.
 *
 * Extracted because there is now more than one. KyberSwap routes Base and
 * Arbitrum; X Layer reads its Uniswap V3 pools directly, because no routing
 * service indexes that chain's tokens. The
 * agent must not know which is which — it asks the vault's chain for an
 * aggregator and trades through whatever comes back, so adding a fourth chain
 * is a new adapter rather than a branch in the execution path.
 *
 * The two-step shape is KyberSwap's and is kept because it is the stricter of
 * the two. A quote yields an opaque `routeSummary` that must be handed back
 * untouched to be encoded — it is server-signed, and mutating any field
 * invalidates it. An aggregator whose API is single-step (LI.FI returns
 * calldata with the quote) satisfies this by carrying its own response through
 * as the opaque payload. The reverse would not work: a single-step interface
 * could not express KyberSwap at all without quoting twice and risking a
 * different route between the price shown and the one executed.
 */

export interface RouteRequest {
	tokenIn: Address;
	tokenOut: Address;
	/** Base units of `tokenIn`. */
	amountIn: string;
	slippagePercent?: number;
	/**
	 * Who will send the swap.
	 *
	 * Optional because KyberSwap does not need it to quote. LI.FI does — its
	 * quote endpoint requires `fromAddress` and returns calldata built for that
	 * sender — so an adapter that needs it and is not given one falls back to a
	 * probe address, which is correct for a routability check and never for a
	 * trade. `buildRoute` is where a real sender is mandatory.
	 */
	sender?: Address;
}

/**
 * A quote, or the fact that no pool exists.
 *
 * "No route" is not an error and must not be raised as one: most of the
 * tokenized equities have no pool at any given moment, and rendering that as a
 * failure would turn ordinary market state into an incident. The distinction is
 * load-bearing all the way up to the UI's empty state.
 */
export type QuoteResult =
	| { ok: true; quote: SpotQuote }
	| { ok: false; reason: "no_route"; message: string };

/** An encoded swap, ready to send. */
export interface BuiltSwap {
	/**
	 * Where to send the transaction.
	 *
	 * **Not always the same as `routerAddress`.** KyberSwap encodes a call to
	 * its own router and the two coincide; LI.FI returns a transaction aimed at
	 * whichever contract its chosen tool uses, while the allowance has to sit on
	 * a separate spender. Sending to the approval address is a revert; approving
	 * the transaction target is a revert on `transferFrom` with a full allowance
	 * visible on the explorer, which is the harder of the two to diagnose.
	 */
	to: Address;
	/** The contract that must hold the allowance. Approve this, never `to`. */
	routerAddress: Address;
	data: Hex;
	/** Wei of the chain's native token to attach. "0" for an ERC-20 swap. */
	value: string;
	amountIn: string;
	amountOut: string;
	gas: string;
}

export interface SpotAggregator {
	/** For logs and activity reports — "kyberswap", "lifi". */
	readonly name: string;
	/** The chain this instance routes on. One aggregator instance, one chain. */
	readonly chainId: number;

	getRoute(request: RouteRequest): Promise<QuoteResult>;

	buildRoute(params: {
		/** Exactly the `routeSummary` from `getRoute`. Never reconstruct it. */
		routeSummary: unknown;
		sender: Address;
		recipient: Address;
		slippagePercent?: number;
		deadline?: number;
	}): Promise<BuiltSwap>;
}
