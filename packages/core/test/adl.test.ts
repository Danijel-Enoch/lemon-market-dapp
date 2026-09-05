import { describe, expect, it } from "bun:test";
import { adlRisk } from "../src/adl";

const base = {
	side: "short" as const,
	entryPrice: 100,
	size: 10,
	equityUsd: 333.33,
};

describe("adlRisk", () => {
	it("keeps a losing short out of the queue entirely", () => {
		// The mark rose, so the short is down. Losing positions are never taken.
		const risk = adlRisk({ ...base, markPrice: 110 });
		expect(risk.eligible).toBe(false);
		expect(risk.lamps).toBe(0);
		expect(risk.band).toBe("none");
		expect(risk.profitPercent).toBeCloseTo(-10, 6);
	});

	it("puts a winning short in the queue, which is the whole problem", () => {
		// Mark fell 10%: the hedge is winning, the spot leg is down 10%, and this
		// is exactly when the venue may take the hedge away.
		const risk = adlRisk({ ...base, markPrice: 90 });
		expect(risk.eligible).toBe(true);
		expect(risk.profitPercent).toBeCloseTo(10, 6);
		expect(risk.score).toBeGreaterThan(0);
	});

	it("scores linearly in leverage, which is the only input the vault controls", () => {
		const at1x = adlRisk({ ...base, markPrice: 90, equityUsd: 900 });
		const at3x = adlRisk({ ...base, markPrice: 90, equityUsd: 300 });
		expect(at3x.score).toBeCloseTo(at1x.score * 3, 6);
		expect(at3x.lamps).toBeGreaterThan(at1x.lamps);
	});

	it("reports headroom as the further move needed to reach the next band", () => {
		const risk = adlRisk({ ...base, markPrice: 99, equityUsd: 330 });
		expect(risk.band).toBe("low");
		expect(risk.nextBand).toBe("elevated");
		expect(risk.headroomPercent).not.toBeNull();

		// Walk the mark down by exactly the headroom. Equity has to be walked with
		// it — the profit earned on the way is part of it, which is the whole
		// reason the headroom is not just `threshold / leverage`.
		const target = 99 * (1 - (risk.headroomPercent as number) / 100);
		const equityThere = 330 + base.size * (99 - target);
		expect(adlRisk({ ...base, markPrice: target, equityUsd: equityThere }).band).toBe("elevated");

		// A hair short of it is still in the band below, so the number is the
		// crossing point and not merely somewhere past it.
		const justBefore = target * 1.0005;
		const equityJustBefore = 330 + base.size * (99 - justBefore);
		expect(adlRisk({ ...base, markPrice: justBefore, equityUsd: equityJustBefore }).band).toBe(
			"low",
		);
	});

	it("is more conservative than holding leverage fixed, and knowingly so", () => {
		const risk = adlRisk({ ...base, markPrice: 99, equityUsd: 330 });
		// The naive estimate: threshold / current leverage, as a price move.
		const naive = ((0.05 / 3 - 0.01) / 0.99) * 100;
		expect(risk.headroomPercent as number).toBeGreaterThan(naive);
	});

	it("says so when a band cannot be reached at any price", () => {
		// Profit adds equity faster than it adds rank, so this position's score
		// peaks around 0.34 and never reaches "critical" at 0.5.
		const risk = adlRisk({ ...base, markPrice: 70, equityUsd: 620 });
		expect(risk.band).toBe("severe");
		expect(risk.nextBand).toBe("critical");
		expect(risk.nextBandReachable).toBe(false);
		expect(risk.headroomPercent).toBeNull();
		expect(risk.summary).toContain("not reachable");
	});

	it("has no headroom left at the top band", () => {
		const risk = adlRisk({ ...base, markPrice: 50, equityUsd: 200 });
		expect(risk.band).toBe("critical");
		expect(risk.nextBand).toBeNull();
		expect(risk.headroomPercent).toBeNull();
		expect(risk.nextBandReachable).toBe(false);
	});

	it("refuses to score without a position or a price", () => {
		expect(adlRisk({ ...base, markPrice: null }).band).toBe("none");
		expect(adlRisk({ ...base, markPrice: 90, size: 0 }).band).toBe("none");
		expect(adlRisk({ ...base, markPrice: 90, entryPrice: 0 }).band).toBe("none");
	});

	it("scores nothing when equity is unknown, rather than assuming 1x", () => {
		const risk = adlRisk({ ...base, markPrice: 90, equityUsd: null });
		expect(risk.eligible).toBe(false);
		expect(risk.score).toBe(0);
		expect(risk.summary).toContain("equity");
	});

	it("carries market stress separately from the queue position", () => {
		const risk = adlRisk({
			...base,
			markPrice: 90,
			oraclePrice: 92,
			price24hAgo: 100,
		});
		// Mark below oracle is forced selling; both are context, not the score.
		expect(risk.stress.markVsOraclePercent).toBeCloseTo(-2.1739, 3);
		expect(risk.stress.change24hPercent).toBeCloseTo(-10, 6);
	});

	it("treats a long symmetrically, profiting as the mark rises", () => {
		const risk = adlRisk({ ...base, side: "long", markPrice: 110 });
		expect(risk.eligible).toBe(true);
		expect(risk.profitPercent).toBeCloseTo(10, 6);
	});
});
