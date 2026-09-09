import { describe, expect, it } from "bun:test";
import type { NearMpcClient } from "@lemon/near-mpc";
import { createNonceManager } from "viem";
import { agentWalletFor } from "../src/wallet";

/**
 * The nonce the agent's transactions are numbered with.
 *
 * An unwind sold its spot leg and the activity report that followed it was
 * rejected with `nonce too low: next nonce 39, tx nonce 38` — the trades had
 * executed and only the record of them was lost. The cause was that every send
 * asked the node for a nonce independently, and a node that has not yet caught
 * up with a transaction broadcast a moment earlier answers with one already
 * spent.
 *
 * Two things are worth pinning: that the wallet is wired to a nonce manager at
 * all, and that a manager actually refuses to reissue a nonce when the chain
 * reports a stale one. The second is viem's behaviour rather than this repo's,
 * which is exactly why it is worth a test — it is the property the fix depends
 * on, and a viem upgrade that changed it would otherwise bring the bug back
 * silently.
 */

const ADDRESS = "0x00000000000000000000000000000000000000aa" as const;

/** Only the two methods `agentWalletFor` reaches for. */
function stubMpc(): NearMpcClient {
	return {
		derive: () => ({
			evmAddress: ADDRESS,
			solanaAddress: "So11111111111111111111111111111111111111112",
		}),
		solanaMessageSigner: () => async () => "signature",
	} as unknown as NearMpcClient;
}

describe("the agent wallet", () => {
	it("carries a nonce manager, so two sends in one tick cannot claim one nonce", () => {
		const wallet = agentWalletFor(stubMpc(), "vault/NVDA/conservative");
		expect(wallet.account.nonceManager).toBeDefined();
	});

	it("refuses the path that produced the wrong address, before anything is signed", () => {
		expect(() =>
			agentWalletFor(
				stubMpc(),
				"vault/NVDA/conservative",
				"0x00000000000000000000000000000000000000bb",
			),
		).toThrow(/cannot sign for it/);
	});
});

describe("a nonce manager against a lagging node", () => {
	/**
	 * A chain whose reported transaction count can be frozen, which is what a
	 * load-balanced RPC looks like from the client: the transaction was broadcast,
	 * and the node answering the next question has not seen it.
	 */
	function laggingChain(startAt: number) {
		let reported = startAt;
		const manager = createNonceManager({
			source: {
				get: async () => reported,
				set: () => {},
			},
		});
		return {
			manager,
			/** Advance the node's view, as a mined transaction would. */
			mine: () => {
				reported += 1;
			},
			consume: () => manager.consume({ address: ADDRESS, chainId: 8453, client: {} as never }),
		};
	}

	it("does not hand out a nonce it has already issued when the node lags", async () => {
		const chain = laggingChain(38);

		// The spot sell. The node is up to date, so this is the honest answer.
		expect(await chain.consume()).toBe(38);

		// The activity report, moments later. The node still says 38 — it has not
		// caught up with the transaction above. Before the fix this is exactly the
		// number that went out, and the chain rejected it as too low.
		expect(await chain.consume()).toBe(39);
	});

	it("follows the chain once it does catch up", async () => {
		const chain = laggingChain(38);
		expect(await chain.consume()).toBe(38);
		chain.mine();
		expect(await chain.consume()).toBe(39);
		chain.mine();
		expect(await chain.consume()).toBe(40);
	});

	it("keeps separate counts per address, so one vault cannot number another's sends", async () => {
		const manager = createNonceManager({ source: { get: async () => 5, set: () => {} } });
		const other = "0x00000000000000000000000000000000000000bb" as const;

		expect(await manager.consume({ address: ADDRESS, chainId: 8453, client: {} as never })).toBe(5);
		// A different vault's agent wallet, untouched by the send above.
		expect(await manager.consume({ address: other, chainId: 8453, client: {} as never })).toBe(5);
	});
});
