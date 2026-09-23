import { describe, expect, it } from "bun:test";
import {
	type Clock,
	createLimiter,
	DEFAULT_THROTTLE,
	isRateLimited,
	resolveThrottle,
} from "./throttle";

/**
 * A clock that never sleeps.
 *
 * Every test below is about pacing, and pacing tested against the wall clock is
 * either slow or flaky. This keeps a queue of sleepers and jumps straight to
 * whichever wakes next, so a ten-second cooldown costs nothing and the
 * assertions are exact rather than "roughly forty milliseconds".
 *
 * Time advances to the earliest pending wake-up rather than by each sleep's
 * duration — with several requests in flight, adding up their sleeps would
 * count the same elapsed time once per sleeper and report 1500ms for three
 * concurrent 500ms waits.
 */
function fakeClock(): Clock & { elapsed(): number } {
	let time = 0;
	let pending: { at: number; resolve: () => void }[] = [];
	let scheduled = false;

	function schedule() {
		if (scheduled) return;
		scheduled = true;
		// A macrotask, so every promise continuation has settled and queued its
		// own sleep before time is allowed to move again.
		setTimeout(pump, 0);
	}

	function pump() {
		scheduled = false;
		if (pending.length === 0) return;

		time = Math.max(time, Math.min(...pending.map((sleeper) => sleeper.at)));
		const ready = pending.filter((sleeper) => sleeper.at <= time);
		pending = pending.filter((sleeper) => sleeper.at > time);

		schedule();
		for (const sleeper of ready) sleeper.resolve();
	}

	return {
		now: () => time,
		sleep: (ms) =>
			new Promise<void>((resolve) => {
				if (ms <= 0) {
					resolve();
					return;
				}
				pending.push({ at: time + ms, resolve });
				schedule();
			}),
		elapsed: () => time,
	};
}

const options = { ...DEFAULT_THROTTLE, requestsPerSecond: 10 };

describe("isRateLimited", () => {
	it("recognises a 429, however the endpoint phrases it", () => {
		// Base and X Layer both answer with this pair.
		expect(isRateLimited({ status: 429 })).toBe(true);
		expect(isRateLimited({ code: -32016, message: "over rate limit" })).toBe(true);
		expect(isRateLimited({ code: -32005 })).toBe(true);
		expect(isRateLimited({ message: "Too Many Requests" })).toBe(true);
	});

	it("looks through the wrapper viem throws", () => {
		expect(isRateLimited({ message: "HTTP request failed.", cause: { status: 429 } })).toBe(true);
	});

	it("leaves every other failure to Ponder", () => {
		// These do not get better with waiting, and absorbing them here would turn
		// a clear error into a slow one.
		expect(isRateLimited({ code: -32602, message: "invalid params" })).toBe(false);
		expect(isRateLimited({ status: 500, message: "Temporary internal error" })).toBe(false);
		expect(isRateLimited({ code: 19 })).toBe(false);
		expect(isRateLimited(null)).toBe(false);
		expect(isRateLimited("429")).toBe(false);
	});

	it("does not hang on an error that cites itself", () => {
		const error: { message: string; cause?: unknown } = { message: "boom" };
		error.cause = error;
		expect(isRateLimited(error)).toBe(false);
	});
});

describe("createLimiter", () => {
	it("spaces requests at the configured rate", async () => {
		const clock = fakeClock();
		const limiter = createLimiter(options, clock);

		const starts: number[] = [];
		await Promise.all(
			Array.from({ length: 5 }, () =>
				limiter.run(async () => {
					starts.push(clock.now());
				}),
			),
		);

		// 10/s is one every 100ms, and the five are spaced rather than fired at
		// once — which is the failure in the log: six requests inside twelve ms.
		expect(starts).toEqual([0, 100, 200, 300, 400]);
	});

	it("caps how many are in flight at once", async () => {
		const clock = fakeClock();
		// A fast rate, so the concurrency cap is what binds. At 10/s the 100ms
		// spacing alone keeps 50ms bodies from ever overlapping, and the test
		// would pass without the cap existing.
		const limiter = createLimiter({ ...options, requestsPerSecond: 1000, maxConcurrent: 2 }, clock);

		let active = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 8 }, () =>
				limiter.run(async () => {
					active++;
					peak = Math.max(peak, active);
					await clock.sleep(50);
					active--;
				}),
			),
		);

		expect(peak).toBe(2);
	});

	it("absorbs a rate limit and succeeds on the retry", async () => {
		const clock = fakeClock();
		const limiter = createLimiter(options, clock);

		let attempts = 0;
		const result = await limiter.run(async () => {
			if (++attempts < 3) throw { status: 429 };
			return "ok";
		});

		expect(result).toBe("ok");
		expect(attempts).toBe(3);
		// It waited rather than hammering: 500ms then 1000ms, halved at worst by jitter.
		expect(clock.elapsed()).toBeGreaterThanOrEqual(750);
	});

	it("widens the interval while the endpoint keeps refusing", async () => {
		const clock = fakeClock();
		const limiter = createLimiter(options, clock);
		expect(limiter.intervalMs()).toBe(100);

		await limiter.run(async () => {
			if (limiter.intervalMs() < 300) throw { status: 429 };
			return "ok";
		});

		// Ponder's own estimate falls 5% per event and floors at 3/s, which is why
		// it never converges on a node allowing less. This moves in 50% steps.
		expect(limiter.intervalMs()).toBeGreaterThan(100);
	});

	it("holds every queued request back, not just the one that was refused", async () => {
		// The point of a shared cooldown. Private per-request backoff expires at
		// slightly different moments and reproduces the burst that caused the 429.
		const clock = fakeClock();
		const limiter = createLimiter({ ...options, maxConcurrent: 4 }, clock);

		let refused = false;
		const starts: number[] = [];
		await Promise.all(
			Array.from({ length: 4 }, () =>
				limiter.run(async () => {
					starts.push(clock.now());
					if (!refused) {
						refused = true;
						throw { status: 429 };
					}
				}),
			),
		);

		const afterCooldown = starts.filter((start) => start >= 250);
		expect(afterCooldown.length).toBeGreaterThanOrEqual(3);
	});

	it("gives the error to Ponder once the retries are spent", async () => {
		const clock = fakeClock();
		const limiter = createLimiter({ ...options, maxRetries: 2 }, clock);

		let attempts = 0;
		await expect(
			limiter.run(async () => {
				attempts++;
				throw { status: 429, message: "over rate limit" };
			}),
		).rejects.toMatchObject({ status: 429 });

		// Three calls: the first plus two retries. Ponder then applies its own.
		expect(attempts).toBe(3);
	});

	it("does not retry a failure that waiting cannot fix", async () => {
		const clock = fakeClock();
		const limiter = createLimiter(options, clock);

		let attempts = 0;
		await expect(
			limiter.run(async () => {
				attempts++;
				throw { code: -32602, message: "invalid params" };
			}),
		).rejects.toMatchObject({ code: -32602 });

		expect(attempts).toBe(1);
		expect(clock.elapsed()).toBe(0);
	});

	it("releases its slot when a request throws", async () => {
		// Otherwise a run of failures leaks the concurrency budget and the limiter
		// wedges shut — a worse outcome than the rate limiting it exists to fix.
		const clock = fakeClock();
		const limiter = createLimiter({ ...options, maxConcurrent: 1, maxRetries: 0 }, clock);

		for (let i = 0; i < 3; i++) {
			await expect(limiter.run(async () => Promise.reject({ code: -32602 }))).rejects.toBeDefined();
		}

		expect(await limiter.run(async () => "ok")).toBe("ok");
	});
});

describe("resolveThrottle", () => {
	it("is off unless asked for, so a keyed endpoint is left alone", () => {
		expect(resolveThrottle("BASE", {})).toBeNull();
		// Compose writes an unset variable as "", which is not a request to throttle.
		expect(resolveThrottle("BASE", { INDEXER_RPC_MAX_RPS_BASE: "" })).toBeNull();
	});

	it("reads the rate, and defaults the rest", () => {
		expect(resolveThrottle("BASE", { INDEXER_RPC_MAX_RPS_BASE: "3" })).toEqual({
			...DEFAULT_THROTTLE,
			requestsPerSecond: 3,
			batch: false,
		});
	});

	it("takes a fractional rate, for an endpoint slower than one a second", () => {
		expect(
			resolveThrottle("XLAYER", { INDEXER_RPC_MAX_RPS_XLAYER: "0.5" })?.requestsPerSecond,
		).toBe(0.5);
	});

	it("reads the concurrency and batch switches per chain", () => {
		const throttle = resolveThrottle("BASE", {
			INDEXER_RPC_MAX_RPS_BASE: "2",
			INDEXER_RPC_MAX_CONCURRENT_BASE: "1",
			INDEXER_RPC_BATCH_BASE: "true",
		});
		expect(throttle?.maxConcurrent).toBe(1);
		expect(throttle?.batch).toBe(true);
	});

	it("does not read another chain's throttle", () => {
		expect(resolveThrottle("ARBITRUM", { INDEXER_RPC_MAX_RPS_BASE: "3" })).toBeNull();
	});

	it("rejects a rate that is not a positive number, naming the variable", () => {
		expect(() => resolveThrottle("BASE", { INDEXER_RPC_MAX_RPS_BASE: "slow" })).toThrow(
			/INDEXER_RPC_MAX_RPS_BASE/,
		);
		expect(() => resolveThrottle("BASE", { INDEXER_RPC_MAX_RPS_BASE: "0" })).toThrow();
		expect(() => resolveThrottle("BASE", { INDEXER_RPC_MAX_RPS_BASE: "-1" })).toThrow();
	});
});
