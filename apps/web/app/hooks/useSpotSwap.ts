import { type SpotQuoteResult, spotApi } from "@app/lib/api";
import { erc20Abi, MAX_UINT256 } from "@app/lib/erc20";
import type { SpotTokenInfo } from "@lemon/core";
import { toBaseUnits, USDC_ADDRESS, USDC_DECIMALS } from "@lemon/core";
import {
	readContract,
	sendTransaction,
	waitForTransactionReceipt,
	writeContract,
} from "@wagmi/core";
import { useCallback, useState } from "react";
import { useConfig, useConnection } from "wagmi";

export type SwapStage = "idle" | "quoting" | "approving" | "building" | "signing" | "confirming";

export interface SwapOutcome {
	txHash: `0x${string}`;
	amountOut: string;
}

/**
 * Market buy/sell of a tokenized stock through the KyberSwap aggregator.
 *
 * Quote and build are two separate upstream calls and the `routeSummary` from
 * the first must reach the second untouched — it is a server-signed payload, so
 * rebuilding or reformatting it invalidates the quote.
 */
export function useSpotSwap() {
	const config = useConfig();
	const { address } = useConnection();
	const [stage, setStage] = useState<SwapStage>("idle");
	const [error, setError] = useState<string | null>(null);

	const swap = useCallback(
		async (params: {
			token: SpotTokenInfo;
			direction: "buy" | "sell";
			amount: string;
			slippagePercent?: number;
			/** Pre-fetched quote, to execute exactly what the user was shown. */
			quote?: Extract<SpotQuoteResult, { ok: true }>;
		}): Promise<SwapOutcome | null> => {
			if (!address) throw new Error("Connect a wallet first.");
			setError(null);

			try {
				setStage("quoting");
				const quoted =
					params.quote ??
					((await spotApi.quote({
						symbol: params.token.symbol,
						direction: params.direction,
						amount: params.amount,
						slippagePercent: params.slippagePercent,
					})) as SpotQuoteResult);

				if (!quoted.ok) {
					throw new Error(quoted.message);
				}

				const { quote } = quoted;

				// The router pulls the input token, so it needs an allowance for
				// whichever side we are selling.
				const sellToken =
					params.direction === "buy" ? USDC_ADDRESS : (params.token.address as `0x${string}`);
				const sellAmount = BigInt(quote.amountIn);

				const allowance = (await readContract(config, {
					address: sellToken,
					abi: erc20Abi,
					functionName: "allowance",
					args: [address, quote.routerAddress],
				})) as bigint;

				if (allowance < sellAmount) {
					setStage("approving");
					const approveHash = await writeContract(config, {
						address: sellToken,
						abi: erc20Abi,
						functionName: "approve",
						args: [quote.routerAddress, MAX_UINT256],
					});
					await waitForTransactionReceipt(config, { hash: approveHash });
				}

				setStage("building");
				const built = await spotApi.build({
					routeSummary: quote.routeSummary,
					sender: address,
					recipient: address,
					slippagePercent: params.slippagePercent,
				});

				setStage("signing");
				const hash = await sendTransaction(config, {
					to: built.routerAddress,
					data: built.data,
					value: 0n,
				});

				setStage("confirming");
				await waitForTransactionReceipt(config, { hash });

				setStage("idle");
				return { txHash: hash, amountOut: quote.amountOut };
			} catch (cause) {
				setStage("idle");
				const message = cause instanceof Error ? cause.message : "Swap failed";
				setError(message);
				throw cause;
			}
		},
		[address, config],
	);

	return { swap, stage, error, isBusy: stage !== "idle" };
}

/** Human amount -> base units for whichever side is being sold. */
export function sellAmountBaseUnits(
	direction: "buy" | "sell",
	amount: string,
	tokenDecimals: number,
): bigint {
	return direction === "buy"
		? toBaseUnits(amount, USDC_DECIMALS)
		: toBaseUnits(amount, tokenDecimals);
}
