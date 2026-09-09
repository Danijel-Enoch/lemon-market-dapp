import { describe, expect, it } from "bun:test";
import {
	COOLDOWN_BASE_SECONDS,
	COOLDOWN_MAX_SECONDS,
	cooldownKey,
	createCooldown,
} from "../src/cooldown";

const NOW = 1_800_000_000;

/**
 * A cooldown on an injected clock.
 *
 * Deliberately not a timer. A backoff that doubles to half an hour cannot be
 * waited out in a test, and a fake timer would test the timer rather than the
 * arithmetic — the clock is a parameter precisely so the wait can be moved
 * rather than served.
 */
function clocked(start = NOW) {
	let seconds = start;
	return {
		cooldown: createCooldown(() => seconds),
		advance: (by: number) => {
			seconds += by;
		},
	};
}

const KEY = cooldownKey("REBALANCE", "NVDA");

describe("cooldownKey", () => {
	/**
	 * Keyed per action *and* per market. A rebalance that cannot be placed on
	 * NVDA says nothing about whether a redemption can be paid out of TSLA.
	 */
	it("tells two markets' failures apart", () => {
		expect(cooldownKey("REBALANCE", "NVDA")).not.toBe(cooldownKey("REBALANCE", "TSLA"));
	});

	it("tells two actions on the same market apart", () => {
		expect(cooldownKey("REBALANCE", "NVDA")).not.toBe(cooldownKey("UNWIND", "NVDA"));
	});

	it("gives an action aimed at no market a key of its own", () => {
		expect(cooldownKey("HOLD", null)).toBe("HOLD:-");
	});
});

describe("createCooldown", () => {
	it("stands out of the way until something has actually failed", () => {
		const { cooldown } = clocked();
		expect(cooldown.blockedFor(KEY)).toBe(0);
		expect(cooldown.failures(KEY)).toBe(0);
	});

	/**
	 * The first failure waits the base interval rather than twice it: the common
	 * case is a transient upstream error, and making the cheapest recovery the
	 * slowest one would be backwards.
	 */
	it("buys one base interval of silence on the first failure", () => {
		const { cooldown } = clocked();
		cooldown.failed(KEY);
		expect(cooldown.blockedFor(KEY)).toBe(COOLDOWN_BASE_SECONDS);
		expect(cooldown.failures(KEY)).toBe(1);
	});

	it("doubles the wait each time it is proved right", () => {
		const { cooldown } = clocked();
		for (const [failures, expected] of [
			[1, COOLDOWN_BASE_SECONDS],
			[2, COOLDOWN_BASE_SECONDS * 2],
			[3, COOLDOWN_BASE_SECONDS * 4],
			[4, COOLDOWN_BASE_SECONDS * 8],
		] as const) {
			cooldown.failed(KEY);
			expect(cooldown.failures(KEY)).toBe(failures);
			expect(cooldown.blockedFor(KEY)).toBe(Math.min(COOLDOWN_MAX_SECONDS, expected));
		}
	});

	/**
	 * Bounded, because a cooldown is a way of being patient rather than a way of
	 * giving up. A dry pool or a market that reopens resolves on its own schedule,
	 * and an unbounded backoff would still be asleep when it did.
	 */
	it("stops lengthening at the cap however long the failure runs", () => {
		const { cooldown } = clocked();
		for (let i = 0; i < 20; i += 1) cooldown.failed(KEY);
		expect(cooldown.failures(KEY)).toBe(20);
		expect(cooldown.blockedFor(KEY)).toBe(COOLDOWN_MAX_SECONDS);
	});

	it("counts down as the clock moves and clears when the wait is served", () => {
		const { cooldown, advance } = clocked();
		cooldown.failed(KEY);
		advance(COOLDOWN_BASE_SECONDS - 1);
		expect(cooldown.blockedFor(KEY)).toBe(1);
		advance(1);
		expect(cooldown.blockedFor(KEY)).toBe(0);
	});

	/** Remaining seconds rather than a boolean, so an operator can be told how long. */
	it("never reports a negative wait once the moment has long passed", () => {
		const { cooldown, advance } = clocked();
		cooldown.failed(KEY);
		advance(COOLDOWN_MAX_SECONDS * 10);
		expect(cooldown.blockedFor(KEY)).toBe(0);
	});

	/**
	 * Wiped rather than halved. The backoff describes one action being stuck, and
	 * an action that has just worked is not stuck — carrying a residual wait
	 * forward would throttle a vault that had already recovered.
	 */
	it("forgets the whole backoff on a success rather than decaying it", () => {
		const { cooldown } = clocked();
		cooldown.failed(KEY);
		cooldown.failed(KEY);
		cooldown.failed(KEY);
		expect(cooldown.blockedFor(KEY)).toBeGreaterThan(0);

		cooldown.succeeded(KEY);

		expect(cooldown.blockedFor(KEY)).toBe(0);
		expect(cooldown.failures(KEY)).toBe(0);
	});

	it("starts the next backoff from the base again after a success", () => {
		const { cooldown } = clocked();
		cooldown.failed(KEY);
		cooldown.failed(KEY);
		cooldown.succeeded(KEY);
		cooldown.failed(KEY);
		expect(cooldown.blockedFor(KEY)).toBe(COOLDOWN_BASE_SECONDS);
	});

	it("shrugs at a success for something that never failed", () => {
		const { cooldown } = clocked();
		cooldown.succeeded(KEY);
		expect(cooldown.blockedFor(KEY)).toBe(0);
	});

	// -- one failing leg must never quiet the whole vault --------------------

	/**
	 * The property the per-market key exists for. A rebalance the venue keeps
	 * refusing on NVDA must not stop the agent paying a redemption out of TSLA.
	 */
	it("lets one market back off without silencing another", () => {
		const { cooldown } = clocked();
		const nvda = cooldownKey("REBALANCE", "NVDA");
		const tsla = cooldownKey("REBALANCE", "TSLA");

		cooldown.failed(nvda);
		cooldown.failed(nvda);

		expect(cooldown.blockedFor(nvda)).toBe(COOLDOWN_BASE_SECONDS * 2);
		expect(cooldown.blockedFor(tsla)).toBe(0);
		expect(cooldown.failures(tsla)).toBe(0);
	});

	it("lets one action back off without silencing another on the same market", () => {
		const { cooldown } = clocked();
		cooldown.failed(cooldownKey("REBALANCE", "NVDA"));
		expect(cooldown.blockedFor(cooldownKey("UNWIND", "NVDA"))).toBe(0);
	});

	it("clears one market's backoff without clearing another's", () => {
		const { cooldown } = clocked();
		const nvda = cooldownKey("REBALANCE", "NVDA");
		const tsla = cooldownKey("REBALANCE", "TSLA");
		cooldown.failed(nvda);
		cooldown.failed(tsla);

		cooldown.succeeded(nvda);

		expect(cooldown.blockedFor(nvda)).toBe(0);
		expect(cooldown.blockedFor(tsla)).toBe(COOLDOWN_BASE_SECONDS);
	});
});
