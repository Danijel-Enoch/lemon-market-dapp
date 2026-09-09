import { describe, expect, it } from "bun:test";
import { type MarketHedgeInput, marketHedge, unrealisedPnl } from "./position";

/**
 * The perp leg's mark-to-market, which the venue does not publish.
 *
 * Worth testing because the figure it replaces was read from a key Pacifica has
 * never sent — `unrealized_pnl` is not on the positions payload — so the panel
 * showed a dash on every vault that has ever held a position, and nothing in the
 * types objected because the read went through `any`.
 */
describe("unrealisedPnl", () => {
	it("profits a short when the mark falls below entry", () => {
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 90, size: 2, side: "short" })).toBeCloseTo(
			20,
			6,
		);
	});

	it("loses a short when the mark rises above entry", () => {
		// The ordinary state of a basis vault in a rising market, and not a
		// drawdown: the spot leg is up by the same amount.
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 110, size: 2, side: "short" })).toBeCloseTo(
			-20,
			6,
		);
	});

	it("reads the other way round for a long", () => {
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 110, size: 2, side: "long" })).toBeCloseTo(
			20,
			6,
		);
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 90, size: 2, side: "long" })).toBeCloseTo(
			-20,
			6,
		);
	});

	it("uses the magnitude of the size, not its sign", () => {
		// The leg carries its side separately, and a short is stored negative one
		// layer up. Multiplying by the signed size would flip the answer.
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 90, size: -2, side: "short" })).toBeCloseTo(
			20,
			6,
		);
	});

	it("is zero for a position marked exactly at its entry", () => {
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 100, size: 2, side: "short" })).toBe(0);
	});

	it("cannot be computed without both prices, and says so rather than guessing", () => {
		// Null, never zero. Zero is a real answer meaning "flat against entry", and
		// an unpriced market rendered as zero is a confident wrong number in the
		// one place a reader would trust it.
		expect(unrealisedPnl({ entryPrice: null, markPrice: 90, size: 2, side: "short" })).toBeNull();
		expect(unrealisedPnl({ entryPrice: 100, markPrice: null, size: 2, side: "short" })).toBeNull();
		// Zero is how the venue reports an absent price; no position opens at zero.
		expect(unrealisedPnl({ entryPrice: 0, markPrice: 90, size: 2, side: "short" })).toBeNull();
		expect(unrealisedPnl({ entryPrice: 100, markPrice: 0, size: 2, side: "short" })).toBeNull();
		expect(
			unrealisedPnl({ entryPrice: 100, markPrice: 90, size: Number.NaN, side: "short" }),
		).toBeNull();
	});
});

/**
 * Whether a hedge can be brought back to neutral, and if not, why not.
 *
 * Worth testing exhaustively because the two blocked states are the ones a
 * depositor actually meets and the ones the page previously said nothing about.
 * A vault sitting 2.89% off neutral with a $0.45 correction against a $10 venue
 * minimum is not broken — but a UI that only knows "drifted" and "rebalancing"
 * has no way to say so, and silence there reads as a broken agent.
 *
 * The venue's two floors are the substance of it. `lotSize` is a quantity grid
 * in units of the underlying and `minOrderUsd` is a floor on the order's dollar
 * notional; they are different measures, and passing one is no protection
 * against the other.
 */

const NVDA: MarketHedgeInput = {
	ticker: "NVDA",
	spotSymbol: "NVDAx",
	spotTokenAddress: "0xnvda",
	perpSymbol: "NVDA",
	spotUnits: 10,
	perpUnits: 10,
	markPrice: 180,
	lotSize: 0.001,
	minOrderUsd: 10,
	rebalanceDriftBps: 500,
};

function hedge(overrides: Partial<MarketHedgeInput> = {}) {
	return marketHedge({ ...NVDA, ...overrides });
}

describe("marketHedge", () => {
	it("is neutral when the legs match", () => {
		const health = hedge();
		expect(health.status).toBe("neutral");
		expect(health.exposure).toBe("neutral");
		expect(health.driftPercent).toBe(0);
		expect(health.deltaUsd).toBe(0);
	});

	it("is neutral inside the vault's threshold even when the legs differ", () => {
		// 2% out, against a 5% threshold. The drift is real and is reported; what
		// the status says is that this vault has decided not to chase it.
		const health = hedge({ perpUnits: 9.8 });
		expect(health.driftPercent).toBeCloseTo(2, 6);
		expect(health.status).toBe("neutral");
		expect(health.exposure).toBe("neutral");
	});

	it("reads the threshold off the vault rather than a constant", () => {
		// Same legs, tighter vault. The registry's own 1% constant would have
		// judged both of these the same way.
		const loose = hedge({ perpUnits: 9.8, rebalanceDriftBps: 500 });
		const tight = hedge({ perpUnits: 9.8, rebalanceDriftBps: 100 });
		expect(loose.status).toBe("neutral");
		expect(tight.status).toBe("ready");
		expect(loose.thresholdPercent).toBe(5);
		expect(tight.thresholdPercent).toBe(1);
	});

	it("is ready when the correction clears both of the venue's floors", () => {
		// 1 unit short of hedged at $180 — well over the lot grid and the minimum.
		const health = hedge({ perpUnits: 9 });
		expect(health.status).toBe("ready");
		expect(health.exposure).toBe("long");
		expect(health.driftPercent).toBeCloseTo(10, 6);
		expect(health.correctionUnits).toBeCloseTo(1, 6);
		expect(health.correctionUsd).toBeCloseTo(180, 6);
	});

	it("calls an over-hedged position short, not just negative", () => {
		const health = hedge({ perpUnits: 11 });
		expect(health.exposure).toBe("short");
		expect(health.deltaUnits).toBeCloseTo(-1, 6);
		expect(health.driftPercent).toBeCloseTo(-10, 6);
		expect(health.status).toBe("ready");
	});

	it("blocks a correction that rounds to nothing on the lot grid", () => {
		// A whole-unit grid, and a gap of a fifth of a unit. Past the threshold and
		// still unplaceable: there is no order that closes it.
		const health = hedge({ spotUnits: 1, perpUnits: 0.8, lotSize: 1 });
		expect(health.driftPercent).toBeCloseTo(20, 6);
		expect(health.correctionUnits).toBe(0);
		expect(health.status).toBe("below-lot-size");
	});

	it("blocks a correction worth less than the venue's minimum order", () => {
		// The live case, on a vault still configured at the old 1% threshold: 2.89%
		// off neutral on a small position, a correction that snaps onto the grid at
		// 0.0025 units and is worth $0.45 against a $10 floor. The lot grid is
		// satisfied; the notional floor is not. Raising the threshold to the 5%
		// default is what stops the agent offering this every tick — but a vault
		// left at 1% must still be able to say why nothing is happening.
		const health = hedge({
			spotUnits: 0.0865,
			perpUnits: 0.084,
			markPrice: 225,
			rebalanceDriftBps: 100,
		});
		expect(health.driftPercent).toBeCloseTo(2.89, 2);
		expect(health.status).toBe("below-min-notional");
		expect(health.correctionUnits).toBeCloseTo(0.002, 6);
		expect(health.correctionUsd).toBeCloseTo(0.45, 2);
		// Both numbers travel with the status, so the page can name them.
		expect(health.minOrderUsd).toBe(10);
	});

	it("does not block on a minimum the venue does not impose", () => {
		const health = hedge({
			spotUnits: 0.0865,
			perpUnits: 0.084,
			minOrderUsd: 0,
			rebalanceDriftBps: 100,
		});
		expect(health.status).toBe("ready");
	});

	it("cannot judge a rebalance with no mark to price the correction at", () => {
		// Drift is a unit comparison and survives an unpriced market; whether the
		// correction clears a dollar floor does not.
		const health = hedge({ perpUnits: 9, markPrice: null });
		expect(health.driftPercent).toBeCloseTo(10, 6);
		expect(health.deltaUsd).toBeNull();
		expect(health.correctionUsd).toBeNull();
		expect(health.status).toBe("unknown");
	});

	it("cannot judge a rebalance with no venue specification", () => {
		expect(hedge({ perpUnits: 9, lotSize: null }).status).toBe("unknown");
		expect(hedge({ perpUnits: 9, minOrderUsd: null }).status).toBe("unknown");
	});

	it("reports an unread leg as unknown rather than as zero", () => {
		// An unreachable venue and a hedge that has actually gone are the same
		// numbers and opposite meanings. Only one of them is an emergency.
		const unread = hedge({ perpUnits: null });
		expect(unread.status).toBe("unknown");
		expect(unread.driftPercent).toBe(0);
		expect(unread.exposure).toBe("neutral");

		const gone = hedge({ perpUnits: 0 });
		expect(gone.status).toBe("ready");
		expect(gone.driftPercent).toBeCloseTo(100, 6);
	});

	it("calls a short with no spot behind it fully over-hedged", () => {
		// Nothing to express the gap as a percentage of, and the drift maths
		// guards the divide by returning zero — which would render a naked short
		// as perfectly neutral.
		const health = hedge({ spotUnits: 0, perpUnits: 2 });
		expect(health.driftPercent).toBe(-100);
		expect(health.exposure).toBe("short");
		expect(health.status).toBe("ready");
	});

	it("is neutral when the vault holds nothing at all", () => {
		const health = hedge({ spotUnits: 0, perpUnits: 0 });
		expect(health.driftPercent).toBe(0);
		expect(health.status).toBe("neutral");
	});
});
