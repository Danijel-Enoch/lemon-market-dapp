import { afterEach, describe, expect, it } from "bun:test";
import { LifiAggregatorClient, XLAYER_USDG } from "../src/aggregator";

const USDC = "0xB6CEceAB302E2E4948951eE7843FC24E92933061" as const;
const XETH = "0xe7b000003a45145decf8a28fc755ad5ec5ea025a" as const;

/**
 * A fake LI.FI, keyed by the pair being asked for.
 *
 * Stubbed rather than live on purpose. The logic worth testing is which of the
 * up-to-three quote calls the adapter makes and which result it picks, and that
 * is deterministic — whereas LI.FI's free tier answers a burst of probes with
 * "retry in 2 hours", which would make this suite fail for a reason that has
 * nothing to do with the code.
 */
function stub(routes: Record<string, { out: string; inUsd: number; outUsd: number } | null>) {
	const calls: string[] = [];
	const original = globalThis.fetch;

	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = new URL(typeof input === "string" ? input : input.toString());
		const from = url.searchParams.get("fromToken") ?? "";
		const to = url.searchParams.get("toToken") ?? "";
		const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
		calls.push(key);

		const hit = routes[key];
		if (!hit) {
			return new Response(JSON.stringify({ message: "No available quotes" }), { status: 404 });
		}
		return new Response(
			JSON.stringify({
				id: "q",
				tool: "sushiswap",
				toolDetails: { key: "sushiswap", name: "SushiSwap Aggregator" },
				action: {
					fromToken: { address: from, symbol: "IN", decimals: 6 },
					toToken: { address: to, symbol: "OUT", decimals: 18 },
					fromAmount: url.searchParams.get("fromAmount"),
				},
				estimate: {
					fromAmount: url.searchParams.get("fromAmount"),
					toAmount: hit.out,
					toAmountMin: hit.out,
					fromAmountUSD: String(hit.inUsd),
					toAmountUSD: String(hit.outUsd),
					approvalAddress: "0x00000000000000000000000000000000000000aa",
					gasCosts: [{ amountUSD: "0.01", estimate: "200000" }],
				},
				transactionRequest: { to: "0x00000000000000000000000000000000000000bb", data: "0xdead" },
			}),
			{ status: 200 },
		);
	}) as typeof fetch;

	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

let active: { restore: () => void } | null = null;
afterEach(() => {
	active?.restore();
	active = null;
});

const key = (a: string, b: string) => `${a.toLowerCase()}->${b.toLowerCase()}`;
const client = () => new LifiAggregatorClient();
const route = (c = client()) =>
	c.getRoute({ tokenIn: USDC, tokenOut: XETH, amountIn: "5000000000", slippagePercent: 0.5 });

describe("the bridge-asset hop", () => {
	/**
	 * The case the hop exists for. X Layer's deep pools quote against USDG, so
	 * most of its markets have no direct USDC pair at all — and before the hop
	 * this adapter reported them as unroutable, which is how a chain with eleven
	 * tradable equities looked empty.
	 */
	it("finds a route through USDG when the direct pair has no pool", async () => {
		const s = stub({
			[key(USDC, XLAYER_USDG)]: { out: "4990000000", inUsd: 5000, outUsd: 4988 },
			[key(XLAYER_USDG, XETH)]: { out: "1200000000000000000", inUsd: 4988, outUsd: 4960 },
		});
		active = s;

		const r = await route();
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.quote.amountOut).toBe("1200000000000000000");
		// Priced end to end: what went in against what arrived, not leg two alone.
		expect(r.quote.amountInUsd).toBe(5000);
		expect(r.quote.priceImpactPercent).toBeCloseTo(-0.8, 1);
		expect(s.calls).toHaveLength(3);
	});

	it("keeps a good direct fill and does not spend two more calls on it", async () => {
		const s = stub({
			[key(USDC, XETH)]: { out: "1250000000000000000", inUsd: 5000, outUsd: 4995 },
		});
		active = s;

		const r = await route();
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.quote.amountOut).toBe("1250000000000000000");
		// -0.1% is well inside the hop's own cost, so the hop cannot win and is
		// not quoted. One call, not three — LI.FI rate-limits per call.
		expect(s.calls).toEqual([key(USDC, XETH)]);
	});

	it("takes the hop when a poor direct fill is beaten by it", async () => {
		const s = stub({
			[key(USDC, XETH)]: { out: "1000000000000000000", inUsd: 5000, outUsd: 4500 },
			[key(USDC, XLAYER_USDG)]: { out: "4990000000", inUsd: 5000, outUsd: 4988 },
			[key(XLAYER_USDG, XETH)]: { out: "1240000000000000000", inUsd: 4988, outUsd: 4950 },
		});
		active = s;

		const r = await route();
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.quote.amountOut).toBe("1240000000000000000");
		expect(r.quote.exchanges).toContain("SushiSwap Aggregator");
	});

	it("keeps the direct fill when the hop quotes worse", async () => {
		const s = stub({
			[key(USDC, XETH)]: { out: "1230000000000000000", inUsd: 5000, outUsd: 4900 },
			[key(USDC, XLAYER_USDG)]: { out: "4990000000", inUsd: 5000, outUsd: 4988 },
			[key(XLAYER_USDG, XETH)]: { out: "1100000000000000000", inUsd: 4988, outUsd: 4400 },
		});
		active = s;

		const r = await route();
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.quote.amountOut).toBe("1230000000000000000");
	});

	it("reports no route as market state rather than raising", async () => {
		const s = stub({});
		active = s;

		const r = await route();
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toBe("no_route");
	});

	/** A half-priced hop is not a hop. Both legs or neither. */
	it("ignores a hop whose second leg has no pool", async () => {
		const s = stub({ [key(USDC, XLAYER_USDG)]: { out: "4990000000", inUsd: 5000, outUsd: 4988 } });
		active = s;

		const r = await route();
		expect(r.ok).toBe(false);
	});

	it("does not quote the bridge asset against itself", async () => {
		const s = stub({ [key(USDC, XLAYER_USDG)]: { out: "4990000000", inUsd: 5000, outUsd: 4988 } });
		active = s;

		const r = await client().getRoute({
			tokenIn: USDC,
			tokenOut: XLAYER_USDG,
			amountIn: "5000000000",
		});
		expect(r.ok).toBe(true);
		expect(s.calls).toEqual([key(USDC, XLAYER_USDG)]);
	});

	it("skips the hop entirely on a chain with no bridge asset", async () => {
		const s = stub({});
		active = s;

		const r = await new LifiAggregatorClient({ chainId: 8453, bridgeAsset: null }).getRoute({
			tokenIn: USDC,
			tokenOut: XETH,
			amountIn: "5000000000",
		});
		expect(r.ok).toBe(false);
		expect(s.calls).toHaveLength(1);
	});
});
