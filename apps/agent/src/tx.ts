import type { Hex } from "viem";

/**
 * Wait for a transaction, and refuse to carry on if it reverted.
 *
 * `waitForTransactionReceipt` resolves just as readily for a reverted
 * transaction as for a successful one — the receipt carries `status:
 * "reverted"` and nothing throws — so awaiting it and looking no further reads
 * a failure as a completion. That is not a theoretical distinction. A spot buy
 * reverted on Base after its short had already opened; the deploy walked past
 * it, wrote a `SPOT_BUY` row for zero tokens pointing at the reverted
 * transaction, skipped the unwind that exists for exactly that case, and left a
 * leveraged short with nothing behind it. The transaction was on chain and the
 * agent believed it had worked.
 *
 * So every write goes through here. `bridge.ts` had the check from the start
 * and was the only caller that did; this is the same check, in one place, for
 * the rest of them.
 */
export async function confirmed(
	// Loosely typed for the same reason `VaultClient`'s clients are: this is
	// called from both sides of that boundary.
	// biome-ignore lint/suspicious/noExplicitAny: see `vault.ts`.
	publicClient: any,
	hash: Hex,
	/** What was being attempted, for the error a human reads. */
	what: string,
): Promise<void> {
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== "success") {
		throw new Error(`${what} reverted on Base (${hash}).`);
	}
}
