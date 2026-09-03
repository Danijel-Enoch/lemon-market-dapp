import { describe, expect, test } from "bun:test";
import {
	ALLOWED_TRANSITIONS,
	type BasisStatus,
	canTransition,
	isUnhedged,
	nextStatus,
	repairActionsFor,
	TERMINAL_STATUSES,
} from "../src/basis-machine";

const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as BasisStatus[];

describe("carry state machine", () => {
	test("happy path: validating -> spot filled -> open", () => {
		expect(nextStatus("VALIDATING", { type: "spot_filled" })).toBe("SPOT_FILLED");
		expect(nextStatus("SPOT_FILLED", { type: "perp_opened" })).toBe("OPEN");
	});

	test("happy path unwind: open -> unwinding -> spot closed -> closed", () => {
		expect(nextStatus("OPEN", { type: "unwind_started" })).toBe("UNWINDING");
		expect(nextStatus("UNWINDING", { type: "spot_closed" })).toBe("SPOT_CLOSED");
		expect(nextStatus("SPOT_CLOSED", { type: "closed" })).toBe("CLOSED");
	});

	test("a failure with nothing on-chain is terminal, not an orphan", () => {
		// Nothing was bought or shorted, so there is no exposure to repair.
		expect(nextStatus("VALIDATING", { type: "leg_failed", leg: "SPOT" })).toBe("FAILED");
	});

	test("perp failure after the spot filled orphans rather than fails", () => {
		// The critical case: the user now holds spot with no hedge. Marking this
		// FAILED would imply nothing happened while real funds sit on-chain.
		const status = nextStatus("SPOT_FILLED", { type: "leg_failed", leg: "PERP" });
		expect(status).toBe("ORPHANED");
		expect(TERMINAL_STATUSES).not.toContain(status as BasisStatus);
	});

	test("an orphan is always recoverable in both directions", () => {
		// Complete the missing leg...
		expect(nextStatus("ORPHANED", { type: "perp_opened" })).toBe("OPEN");
		// ...or unwind the one that landed.
		expect(nextStatus("ORPHANED", { type: "unwind_started" })).toBe("UNWINDING");
		expect(nextStatus("ORPHANED", { type: "closed" })).toBe("CLOSED");
	});

	test("a failure during unwind also orphans", () => {
		expect(nextStatus("UNWINDING", { type: "leg_failed", leg: "PERP" })).toBe("ORPHANED");
		expect(nextStatus("SPOT_CLOSED", { type: "leg_failed", leg: "PERP" })).toBe("ORPHANED");
	});

	test("terminal states accept no further transitions", () => {
		for (const status of TERMINAL_STATUSES) {
			expect(ALLOWED_TRANSITIONS[status]).toHaveLength(0);
			expect(nextStatus(status, { type: "unwind_started" })).toBeNull();
			expect(nextStatus(status, { type: "closed" })).toBeNull();
		}
	});

	test("illegal transitions are rejected rather than silently applied", () => {
		// Cannot open a short before the spot leg exists.
		expect(nextStatus("VALIDATING", { type: "perp_opened" })).toBeNull();
		// Cannot jump straight from open to closed without unwinding.
		expect(nextStatus("OPEN", { type: "closed" })).toBeNull();
		expect(canTransition("CLOSED", "OPEN")).toBe(false);
	});

	test("every non-terminal state can still reach a terminal state", () => {
		// Guards against adding a state that traps a position forever.
		const reachable = new Set<BasisStatus>(TERMINAL_STATUSES);
		let changed = true;
		while (changed) {
			changed = false;
			for (const status of ALL_STATUSES) {
				if (reachable.has(status)) continue;
				if (ALLOWED_TRANSITIONS[status].some((next) => reachable.has(next))) {
					reachable.add(status);
					changed = true;
				}
			}
		}
		for (const status of ALL_STATUSES) {
			expect(reachable.has(status)).toBe(true);
		}
	});
});

describe("hedge detection", () => {
	test("one live leg is unhedged", () => {
		expect(
			isUnhedged({ spotOpened: true, spotClosed: false, perpOpened: false, perpClosed: false }),
		).toBe(true);
		expect(
			isUnhedged({ spotOpened: false, spotClosed: false, perpOpened: true, perpClosed: false }),
		).toBe(true);
	});

	test("both legs live, or neither, is hedged", () => {
		expect(
			isUnhedged({ spotOpened: true, spotClosed: false, perpOpened: true, perpClosed: false }),
		).toBe(false);
		expect(
			isUnhedged({ spotOpened: true, spotClosed: true, perpOpened: true, perpClosed: true }),
		).toBe(false);
		expect(
			isUnhedged({ spotOpened: false, spotClosed: false, perpOpened: false, perpClosed: false }),
		).toBe(false);
	});

	test("a half-closed unwind is detected as unhedged", () => {
		// Spot sold, short still open — directional in the opposite direction.
		expect(
			isUnhedged({ spotOpened: true, spotClosed: true, perpOpened: true, perpClosed: false }),
		).toBe(true);
	});
});

describe("repair actions", () => {
	test("spot without a hedge offers both completing and unwinding", () => {
		expect(
			repairActionsFor({
				spotOpened: true,
				spotClosed: false,
				perpOpened: false,
				perpClosed: false,
			}),
		).toEqual(["retry_perp", "unwind_spot"]);
	});

	test("a naked short offers closing it", () => {
		expect(
			repairActionsFor({
				spotOpened: false,
				spotClosed: false,
				perpOpened: true,
				perpClosed: false,
			}),
		).toEqual(["close_perp"]);
	});

	test("a balanced position needs no repair", () => {
		expect(
			repairActionsFor({
				spotOpened: true,
				spotClosed: false,
				perpOpened: true,
				perpClosed: false,
			}),
		).toEqual([]);
	});

	test("every unhedged leg combination yields at least one repair action", () => {
		const flags = [true, false];
		for (const spotOpened of flags)
			for (const spotClosed of flags)
				for (const perpOpened of flags)
					for (const perpClosed of flags) {
						const legs = { spotOpened, spotClosed, perpOpened, perpClosed };
						if (isUnhedged(legs)) {
							expect(repairActionsFor(legs).length).toBeGreaterThan(0);
						}
					}
	});
});
