import { describe, expect, it } from "bun:test";
import type { ActivityInput } from "@lemon/agent/vault";
import { describeStep, OPERATOR_STEPS } from "./operator-actions";

/**
 * What a hand-run step reports back.
 *
 * Everything else in this service is an RPC round trip, an MPC signature or a
 * database write. This is not: it is the one sentence an operator reads to find
 * out what a step they could not watch actually did, and it is derived by
 * arithmetic over the activity rows the venue produced. A total that is wrong
 * here is wrong in the direction of "the money came home" when it did not.
 */

const USDC = 1_000_000n;

function row(over: Partial<ActivityInput>): ActivityInput {
	return {
		kind: "SPOT_SELL",
		chain: "BASE",
		symbol: "NVDAc",
		baseAmount: 0n,
		notionalAssets: 0n,
		pnlAssets: 0n,
		feeAssets: 0n,
		txRef: "0xdeadbeef",
		occurredAt: 0,
		...over,
	};
}

describe("describeStep", () => {
	it("sums the spot sale across markets and says where the money is", () => {
		const sentence = describeStep("CLOSE_SPOT", [
			row({ kind: "SPOT_SELL", notionalAssets: 1_200n * USDC }),
			row({ kind: "SPOT_SELL", symbol: "TSLAc", notionalAssets: 300n * USDC }),
		]);

		expect(sentence).toContain("2 spot legs");
		expect(sentence).toContain("$1,500");
		// The half an operator most needs: sold is not returned.
		expect(sentence).toContain("agent's wallet");
	});

	it("names the shorts it closed", () => {
		const sentence = describeStep("CLOSE_PERP", [
			row({ kind: "PERP_CLOSE", chain: "SOLANA", symbol: "NVDA" }),
		]);

		expect(sentence).toContain("1 short");
		expect(sentence).toContain("NVDA");
		expect(sentence).toContain("still at the venue");
	});

	it("reports what a bridge landed, not what it sent", () => {
		// The relayer takes a cut and nobody knows how much until the fill, so the
		// figure an operator is shown has to be net of it — the gross would read as
		// more money at home than there is.
		const sentence = describeStep("BRIDGE_HOME", [
			row({
				kind: "BRIDGE_OUT",
				chain: "SOLANA",
				symbol: "USDC",
				baseAmount: 1_000n * USDC,
				feeAssets: 3n * USDC,
			}),
		]);

		expect(sentence).toContain("$997");
		expect(sentence).toContain("$3");
		expect(sentence).not.toContain("$1,000");
	});

	it("says a return is free assets, because that is the point of it", () => {
		const sentence = describeStep("RETURN_TO_VAULT", [
			row({ kind: "BRIDGE_IN", symbol: "USDC", notionalAssets: 4_512n * USDC + 340_000n }),
		]);

		expect(sentence).toContain("$4,512.34");
		expect(sentence).toContain("free assets");
	});

	it("tells an empty step from a failed one, for every step", () => {
		// A vault whose spot is already sold runs CLOSE_SPOT to completion and finds
		// nothing to sell. That is an outcome, not a failure, and the sentence has
		// to say so — otherwise the console shows a step that "worked" with nothing
		// against it and an operator cannot tell it apart from one that did.
		for (const step of OPERATOR_STEPS) {
			expect(describeStep(step, [])).toMatch(/nothing/i);
		}
	});

	it("gives the whole close one sentence, ending with what reached the vault", () => {
		const sentence = describeStep("CLOSE_ALL", [
			row({ kind: "PERP_CLOSE", chain: "SOLANA", symbol: "NVDA" }),
			row({ kind: "SPOT_SELL", notionalAssets: 1_000n * USDC }),
			row({ kind: "VENUE_WITHDRAW", chain: "SOLANA", symbol: "USDC" }),
			row({ kind: "BRIDGE_OUT", chain: "SOLANA", symbol: "USDC", baseAmount: 500n * USDC }),
			row({ kind: "BRIDGE_IN", symbol: "USDC", notionalAssets: 1_500n * USDC }),
		]);

		expect(sentence).toBe(
			"Sold 1 spot leg, closed 1 short, swept the margin account and returned $1,500 to the vault.",
		);
	});

	it("describes a re-open that failed part-way by the legs that landed", () => {
		// The only time this sentence is used: a run that placed the position
		// reports the policy's own reasoning instead. A half-built position is
		// exactly the state worth being precise about — margin at the venue and a
		// short open, with no spot bought against it.
		const sentence = describeStep("REOPEN", [
			row({ kind: "VENUE_DEPOSIT", chain: "SOLANA", symbol: "USDC", notionalAssets: 400n * USDC }),
			row({ kind: "PERP_OPEN", chain: "SOLANA", symbol: "NVDA" }),
		]);

		expect(sentence).toContain("Bridged $400 of margin");
		expect(sentence).toContain("opened the NVDA short");
		expect(sentence).not.toContain("bought");
	});

	it("ignores rows from another step", () => {
		// The rows are whatever the adapter produced, and a failed step's carried
		// activity can hold legs from earlier in the same call. Counting a
		// PERP_CLOSE as a spot sale would report a sale that never happened.
		expect(describeStep("CLOSE_SPOT", [row({ kind: "PERP_CLOSE", symbol: "NVDA" })])).toMatch(
			/nothing/i,
		);
	});
});
