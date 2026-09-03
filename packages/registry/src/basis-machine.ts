/**
 * The basis-position state machine, as pure functions.
 *
 * Kept free of database and network calls so the transitions — especially the
 * orphan branch, where one leg is live and the other is not — can be tested
 * exhaustively. That branch is the one that matters: it represents a user
 * holding real, unintended directional exposure, and it must never be
 * reachable-but-unrecoverable.
 */

export type BasisStatus =
	| "VALIDATING"
	| "SPOT_FILLED"
	| "OPEN"
	| "UNWINDING"
	| "SPOT_CLOSED"
	| "CLOSED"
	| "ORPHANED"
	| "FAILED";

export type BasisEvent =
	| { type: "spot_filled" }
	| { type: "perp_opened" }
	| { type: "leg_failed"; leg: "SPOT" | "PERP" }
	| { type: "unwind_started" }
	| { type: "spot_closed" }
	| { type: "closed" };

export const ALLOWED_TRANSITIONS: Record<BasisStatus, BasisStatus[]> = {
	VALIDATING: ["SPOT_FILLED", "FAILED"],
	SPOT_FILLED: ["OPEN", "ORPHANED", "UNWINDING"],
	OPEN: ["UNWINDING"],
	UNWINDING: ["SPOT_CLOSED", "CLOSED", "ORPHANED"],
	SPOT_CLOSED: ["CLOSED", "ORPHANED"],
	// Orphans are repairable in both directions: finish the missing leg, or
	// unwind the one that landed. Never terminal.
	ORPHANED: ["OPEN", "UNWINDING", "CLOSED", "FAILED"],
	CLOSED: [],
	FAILED: [],
};

export const TERMINAL_STATUSES: readonly BasisStatus[] = ["CLOSED", "FAILED"];

export function canTransition(from: BasisStatus, to: BasisStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The status an event moves a position to.
 *
 * A failed leg is only terminal when nothing has reached the chain. Once either
 * leg has landed, failure means ORPHANED — treating it as FAILED would mark the
 * position closed while real funds sit unhedged on-chain.
 */
export function nextStatus(current: BasisStatus, event: BasisEvent): BasisStatus | null {
	let target: BasisStatus;

	switch (event.type) {
		case "spot_filled":
			target = "SPOT_FILLED";
			break;
		case "perp_opened":
			target = "OPEN";
			break;
		case "leg_failed":
			target = current === "VALIDATING" ? "FAILED" : "ORPHANED";
			break;
		case "unwind_started":
			target = "UNWINDING";
			break;
		case "spot_closed":
			target = "SPOT_CLOSED";
			break;
		case "closed":
			target = "CLOSED";
			break;
	}

	return canTransition(current, target) ? target : null;
}

export interface LegState {
	spotOpened: boolean;
	spotClosed: boolean;
	perpOpened: boolean;
	perpClosed: boolean;
}

/**
 * True when exactly one leg is live — the position is directional, not neutral.
 *
 * Derived from the legs rather than the status because it is the ground truth:
 * the status can lag if a transition is interrupted, but the transaction
 * hashes cannot.
 */
export function isUnhedged(legs: LegState): boolean {
	const spotLive = legs.spotOpened && !legs.spotClosed;
	const perpLive = legs.perpOpened && !legs.perpClosed;
	return spotLive !== perpLive;
}

export type RepairAction = "retry_perp" | "unwind_spot" | "close_perp";

/** What has to happen for a position to become consistent again. */
export function repairActionsFor(legs: LegState): RepairAction[] {
	const spotLive = legs.spotOpened && !legs.spotClosed;
	const perpLive = legs.perpOpened && !legs.perpClosed;

	if (spotLive && !perpLive) return ["retry_perp", "unwind_spot"];
	if (perpLive && !spotLive) return ["close_perp"];
	return [];
}
