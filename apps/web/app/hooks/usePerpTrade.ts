import { type OpenPerpInput, type OpenResult, perpApi } from "@app/lib/api";
import { signServerTypedData } from "@app/lib/sign-typed-data";
import { sendTransaction, waitForTransactionReceipt } from "@wagmi/core";
import { useCallback, useState } from "react";
import { useConfig, useConnection } from "wagmi";

export type PerpStage = "idle" | "building" | "signing" | "submitting" | "confirming";

/** Batched-market order-type discriminators. */
const ORDER_TYPE = { MARKET_OPEN: 0, MARKET_CLOSE: 1 } as const;

export interface PerpOutcome {
	mode: "intent" | "transaction";
	txHash?: `0x${string}`;
	trackingId?: string;
	status: string;
}

/**
 * Execute an Avantis order.
 *
 * Gasless by default: the server builds an EIP-712 intent, the wallet signs it,
 * and the Avantis operator submits and pays gas. That matters here because
 * funds arrive via Relay as USDC with no ETH attached, so requiring gas would
 * strand a freshly funded account.
 *
 * Falls back to a direct transaction when the operator rejects the intent, so
 * an operator outage degrades to "pay your own gas" rather than "cannot trade".
 */
export function usePerpTrade() {
	const config = useConfig();
	const { address } = useConnection();
	const [stage, setStage] = useState<PerpStage>("idle");
	const [error, setError] = useState<string | null>(null);

	const execute = useCallback(
		async (result: OpenResult, orderType: number): Promise<PerpOutcome> => {
			if (result.mode === "transaction") {
				setStage("signing");
				const hash = await sendTransaction(config, {
					to: result.tx.to,
					data: result.tx.data,
					value: BigInt(result.tx.value ?? "0"),
				});
				setStage("confirming");
				await waitForTransactionReceipt(config, { hash });
				return { mode: "transaction", txHash: hash, status: "confirmed" };
			}

			const { intent } = result;
			setStage("signing");
			const signature = await signServerTypedData(config, {
				domain: intent.domain,
				types: intent.types,
				primaryType: intent.primaryType,
				message: intent.message,
			});

			setStage("submitting");
			const submitted = await perpApi.submit({
				orderType,
				encodedIntent: intent.encodedIntent,
				signature,
			});

			return {
				mode: "intent",
				trackingId: submitted.trackingId,
				status: submitted.status,
			};
		},
		[config],
	);

	const open = useCallback(
		async (input: Omit<OpenPerpInput, "trader">): Promise<PerpOutcome> => {
			if (!address) throw new Error("Connect a wallet first.");
			setError(null);
			setStage("building");

			try {
				const built = await perpApi.open({ ...input, trader: address });
				return await execute(built, ORDER_TYPE.MARKET_OPEN);
			} catch (cause) {
				// Retry once without gasless before surfacing the failure — an
				// operator problem should not read as "your order was invalid".
				if (input.gasless !== false) {
					try {
						setStage("building");
						const fallback = await perpApi.open({
							...input,
							trader: address,
							gasless: false,
						});
						return await execute(fallback, ORDER_TYPE.MARKET_OPEN);
					} catch {
						// Report the original failure, which is the informative one.
					}
				}
				const message = cause instanceof Error ? cause.message : "Order failed";
				setError(message);
				throw cause;
			} finally {
				setStage("idle");
			}
		},
		[address, execute],
	);

	const close = useCallback(
		async (input: {
			pairIndex: number;
			index: number;
			collateralToCloseUsdc: number;
		}): Promise<PerpOutcome> => {
			if (!address) throw new Error("Connect a wallet first.");
			setError(null);
			setStage("building");

			try {
				const built = await perpApi.close({ ...input, trader: address });
				return await execute(built, ORDER_TYPE.MARKET_CLOSE);
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : "Close failed";
				setError(message);
				throw cause;
			} finally {
				setStage("idle");
			}
		},
		[address, execute],
	);

	const cancelLimitOrder = useCallback(
		async (input: { pairIndex: number; index: number }) => {
			if (!address) throw new Error("Connect a wallet first.");
			setStage("building");
			try {
				const { data: tx } = await perpApi.cancelLimit({ ...input, trader: address });
				setStage("signing");
				const hash = await sendTransaction(config, {
					to: tx.to,
					data: tx.data,
					value: BigInt(tx.value ?? "0"),
				});
				setStage("confirming");
				await waitForTransactionReceipt(config, { hash });
				return hash;
			} finally {
				setStage("idle");
			}
		},
		[address, config],
	);

	return { open, close, cancelLimitOrder, stage, error, isBusy: stage !== "idle" };
}
