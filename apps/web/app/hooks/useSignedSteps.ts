import type { UnsignedStep } from "@lemon/client";
import { useCallback, useState } from "react";
import { useConfig } from "wagmi";
import { sendTransaction, switchChain, waitForTransactionReceipt } from "wagmi/actions";

/**
 * Sending a sequence of server-prepared transactions from the user's wallet.
 *
 * The client half of every two-call action in this app. The server cannot sign
 * for the user's wallet, so it hands back transactions; this gets them signed,
 * in order, waiting for each to confirm before offering the next.
 *
 * ## Why each step is awaited rather than fired together
 *
 * The steps are ordered and dependent — an approval has to be *mined* before
 * the swap that spends the allowance will succeed, not merely broadcast. A
 * wallet that fires both immediately produces a swap that reverts with
 * `transferFrom` failing, while the approval sits confirming in the next block.
 * That failure is expensive to diagnose from a wallet UI and trivially avoided
 * by waiting.
 *
 * ## Progress is reported per step
 *
 * A user watching two wallet prompts and an on-chain wait needs to know which
 * one they are in. The state below is shaped for that rather than for a single
 * boolean, because "approving" and "swapping" are different sentences and the
 * second one is the one that spends money.
 */

export interface StepProgress {
	/** Zero-based index of the step being worked on. */
	index: number;
	total: number;
	label: string;
	phase: "signing" | "confirming";
}

export interface SignedStepsState {
	running: boolean;
	progress: StepProgress | null;
	error: string | null;
}

/**
 * Run a list of prepared transactions to completion.
 *
 * Returns the hash of the **last** step, which is the one every caller wants:
 * the approval is plumbing and the final transaction is the one that did the
 * thing. Nothing here reports success it has not seen confirmed.
 */
export function useSignedSteps(): [
	SignedStepsState,
	(steps: UnsignedStep[]) => Promise<`0x${string}` | null>,
	() => void,
] {
	const config = useConfig();
	const [state, setState] = useState<SignedStepsState>({
		running: false,
		progress: null,
		error: null,
	});

	const reset = useCallback(() => {
		setState({ running: false, progress: null, error: null });
	}, []);

	const run = useCallback(
		async (steps: UnsignedStep[]): Promise<`0x${string}` | null> => {
			if (steps.length === 0) return null;

			setState({ running: true, progress: null, error: null });
			let last: `0x${string}` | null = null;

			try {
				for (const [index, step] of steps.entries()) {
					setState({
						running: true,
						progress: { index, total: steps.length, label: step.label, phase: "signing" },
						error: null,
					});

					// Asked for before every step rather than once at the start. A
					// wallet can be switched between prompts — by the user, or by
					// another tab — and a transaction sent on the wrong chain is not a
					// rejected prompt but a real transaction against a different set of
					// contracts.
					await switchChain(config, { chainId: step.chainId }).catch(() => undefined);

					const hash = await sendTransaction(config, {
						to: step.to as `0x${string}`,
						data: step.data as `0x${string}`,
						value: BigInt(step.value || "0"),
						chainId: step.chainId,
					});

					setState({
						running: true,
						progress: { index, total: steps.length, label: step.label, phase: "confirming" },
						error: null,
					});

					const receipt = await waitForTransactionReceipt(config, {
						hash,
						chainId: step.chainId,
					});

					if (receipt.status !== "success") {
						throw new Error(`The "${step.label}" transaction reverted. Nothing after it was sent.`);
					}

					last = hash;
				}

				setState({ running: false, progress: null, error: null });
				return last;
			} catch (error) {
				const message = normalise(error);
				setState({ running: false, progress: null, error: message });
				// Rethrown as well as stored: the caller has its own recovery to do —
				// a half-run sequence may have left an approval in place — and
				// swallowing it here would let it continue as though nothing failed.
				throw new Error(message);
			}
		},
		[config],
	);

	return [state, run, reset];
}

/**
 * Wallet errors, in words worth showing.
 *
 * The rejection case is worth special handling because it is not a failure: a
 * user who changed their mind at the prompt has done something completely
 * ordinary, and "User rejected the request" plus a stack trace reads like a bug
 * in the app.
 */
function normalise(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);

	if (/user rejected|user denied|rejected the request/i.test(message)) {
		return "You dismissed the wallet prompt, so nothing was sent.";
	}
	if (/insufficient funds/i.test(message)) {
		return "That wallet does not have enough of the chain's native token to pay for gas.";
	}

	// viem's messages are multi-paragraph and lead with the useful line.
	return message.split("\n")[0] ?? message;
}
