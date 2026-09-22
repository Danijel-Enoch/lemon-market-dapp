import type { Address, Hex } from "@lemon/core";

/**
 * The slice of LI.FI's `/v1/quote` response this adapter reads.
 *
 * Deliberately partial. LI.FI returns a large envelope describing every step of
 * a route it may execute across chains, and this app uses it for exactly one
 * thing: a same-chain swap. Typing only what is read keeps a change on their
 * side from breaking a build over a field nothing touches.
 */
export interface LifiQuote {
	id: string;
	tool: string;
	toolDetails?: { key: string; name: string };
	action: {
		fromToken: { address: Address; symbol: string; decimals: number };
		toToken: { address: Address; symbol: string; decimals: number };
		fromAmount: string;
	};
	estimate: {
		fromAmount: string;
		toAmount: string;
		/** LI.FI's own worst-case after slippage. Not used for sizing — see the adapter. */
		toAmountMin: string;
		fromAmountUSD?: string;
		toAmountUSD?: string;
		approvalAddress: Address;
		gasCosts?: { amountUSD?: string; estimate?: string }[];
	};
	/**
	 * Present on a quote that can be executed. Absent on some informational
	 * responses, which is why the adapter treats its absence as "no route"
	 * rather than dereferencing it.
	 */
	transactionRequest?: {
		to: Address;
		data: Hex;
		value?: string;
		gasLimit?: string;
	};
}
