/**
 * A client-side rate limit for one chain's endpoint, with backoff that pauses
 * everything rather than each request separately.
 *
 * Ponder already retries a failed request with exponential backoff — 125ms
 * doubling to 32s, nine times, which is the `retry_delay` in its logs. That is
 * not the part that overwhelms a free endpoint, and turning it up does not
 * help. The pressure comes from the other end:
 *
 *   const INITIAL_MAX_RPS = 20;
 *   concurrency = 25;
 *
 * Ponder opens at twenty requests a second across twenty-five connections and
 * discovers the real limit by being refused, lowering its estimate five percent
 * per rate-limit event with a floor of three. Against an endpoint that allows a
 * couple of requests a second the discovery takes hundreds of 429s, and each
 * one is a refused request that is then retried — so the backoff never
 * converges, because a dozen sibling requests are still arriving.
 *
 * That is what the log shows: six `eth_getLogs` inside twelve milliseconds,
 * every one 429, every one independently backing off and colliding again.
 *
 * So this limits the rate at which requests *start*, and treats a rate-limit
 * reply as a reason to hold the whole endpoint back rather than to reschedule
 * one request. A shared cooldown is the difference between backing off and
 * stampeding: without it each request's private backoff expires at a slightly
 * different moment and the endpoint is hit again immediately.
 *
 * None of Ponder's own machinery is lost. A custom transport becomes a single
 * backend inside its bucket, so its retries, its provider ranking and its
 * `eth_getLogs` range halving all still run — on top of a request stream that
 * no longer arrives faster than the endpoint accepts.
 */

import { http, type Transport } from "viem";

/** Injectable so the tests need not spend real seconds proving a rate limit. */
export interface Clock {
	now(): number;
	sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ThrottleOptions {
	/** Requests per second. Not a ceiling the endpoint enforces — one we do. */
	requestsPerSecond: number;
	/** How many requests may be in flight at once. */
	maxConcurrent: number;
	/** How many rate-limit replies to absorb before handing one to Ponder. */
	maxRetries: number;
	/** First backoff, doubled per attempt. */
	baseDelayMs: number;
	/** Ceiling for the backoff, so an outage does not park the indexer for an hour. */
	maxDelayMs: number;
}

export const DEFAULT_THROTTLE: Omit<ThrottleOptions, "requestsPerSecond"> = {
	maxConcurrent: 4,
	maxRetries: 6,
	baseDelayMs: 500,
	maxDelayMs: 30_000,
};

/**
 * Is this the endpoint saying "slow down", rather than saying "no"?
 *
 * Only the first is worth absorbing here. A malformed request or an
 * unsupported method fails identically however long we wait, and retrying it
 * quietly would turn a clear error into a slow one — so everything else goes
 * straight to Ponder, which knows how to shrink a block range and when to stop.
 *
 * `-32016` is the code X Layer and Base's public gateway return alongside a
 * 429, and `-32005` is the same thing from several other providers. The status
 * is checked first because a gateway under load sometimes refuses without a
 * JSON-RPC body at all.
 */
export function isRateLimited(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;

	const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
	if (candidate.status === 429 || candidate.code === 429) return true;
	if (candidate.code === -32016 || candidate.code === -32005) return true;

	const message = typeof candidate.message === "string" ? candidate.message : "";
	if (/rate limit|too many requests/i.test(message)) return true;

	const cause = (error as { cause?: unknown }).cause;
	return cause === undefined || cause === error ? false : isRateLimited(cause);
}

export interface Limiter {
	run<T>(operation: () => Promise<T>): Promise<T>;
	/** The interval currently enforced, in ms. Exposed for tests and logging. */
	intervalMs(): number;
}

/**
 * How far the interval may stretch while the endpoint keeps refusing.
 *
 * Ponder's own estimate bottoms out at three requests a second, which is still
 * more than some public nodes give one IP. Ten times the configured interval is
 * the equivalent floor here — a floor rather than an unbounded slowdown,
 * because an endpoint refusing everything is not a problem patience fixes.
 */
const MAX_INTERVAL_MULTIPLIER = 10;
const INTERVAL_GROWTH = 1.5;
/** Recovered slowly, so one lucky response does not undo a measured slowdown. */
const INTERVAL_RECOVERY = 0.98;

export function createLimiter(options: ThrottleOptions, clock: Clock = systemClock): Limiter {
	const baseInterval = 1000 / options.requestsPerSecond;
	const maxInterval = baseInterval * MAX_INTERVAL_MULTIPLIER;

	let interval = baseInterval;
	let nextStart = 0;
	let cooldownUntil = 0;
	let active = 0;
	const waiting: (() => void)[] = [];

	async function acquire(): Promise<void> {
		while (active >= options.maxConcurrent) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		active++;

		// Claim a slot, then wait for it. Claiming before waiting is what spaces
		// concurrent callers out — each takes the next slot, rather than all of
		// them reading the same "now" and starting together.
		const start = Math.max(clock.now(), nextStart, cooldownUntil);
		nextStart = start + interval;

		const delay = start - clock.now();
		if (delay > 0) await clock.sleep(delay);

		// A cooldown may have been declared while this request was queued, by a
		// sibling that was refused. Honour it rather than walking into the same
		// refusal — which is the entire point of sharing one. Looped because the
		// cooldown can be extended again while this request waits out the first.
		for (
			let remaining = cooldownUntil - clock.now();
			remaining > 0;
			remaining = cooldownUntil - clock.now()
		) {
			await clock.sleep(remaining);
		}
	}

	function release(): void {
		active--;
		const next = waiting.shift();
		if (next) next();
	}

	function onRateLimited(attempt: number): void {
		interval = Math.min(interval * INTERVAL_GROWTH, maxInterval);

		const backoff = Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
		// Half jitter. Without it every queued request resumes on the same
		// millisecond and reproduces the burst that caused the refusal.
		const jittered = backoff * (0.5 + Math.random() * 0.5);
		cooldownUntil = Math.max(cooldownUntil, clock.now() + jittered);
	}

	function onSuccess(): void {
		interval = Math.max(interval * INTERVAL_RECOVERY, baseInterval);
	}

	return {
		intervalMs: () => interval,
		async run<T>(operation: () => Promise<T>): Promise<T> {
			for (let attempt = 0; ; attempt++) {
				await acquire();
				try {
					const result = await operation();
					onSuccess();
					return result;
				} catch (error) {
					if (attempt >= options.maxRetries || !isRateLimited(error)) throw error;
					onRateLimited(attempt);
				} finally {
					release();
				}
			}
		},
	};
}

/**
 * One endpoint, rate limited, as a transport Ponder can be handed directly.
 *
 * `retryCount: 0` on the inner transport is deliberate. Viem would otherwise
 * retry inside the slot this limiter just granted — unthrottled, and invisible
 * both to the cooldown above and to Ponder's accounting below, which is three
 * independent retry loops stacked on one request.
 */
export function throttledHttp(
	url: string,
	options: ThrottleOptions & { batch?: boolean; timeoutMs?: number },
	clock: Clock = systemClock,
): Transport {
	const limiter = createLimiter(options, clock);

	return (config) => {
		const transport = http(url, {
			retryCount: 0,
			batch: options.batch ?? false,
			timeout: options.timeoutMs ?? config?.timeout,
		})(config);

		return {
			...transport,
			config: { ...transport.config, key: "throttled-http", name: "Throttled HTTP" },
			request: ((args: unknown) =>
				limiter.run(() =>
					(transport.request as (a: unknown) => Promise<unknown>)(args),
				)) as typeof transport.request,
		};
	};
}

/**
 * The variables this reads, passed in rather than read, so it can be tested.
 */
export interface ThrottleEnv {
	[name: string]: string | undefined;
}

/** Empty is absent — Compose writes an unset variable as "". See `src/rpc.ts`. */
function trimmed(value: string | undefined): string | undefined {
	const text = value?.trim();
	return text ? text : undefined;
}

function positive(name: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} is "${raw}", which is not a positive number.`);
	}
	return value;
}

/**
 * One chain's throttle, or `null` to leave Ponder's own pacing alone.
 *
 * Opt-in, because throttling a keyed endpoint that can take the load is just a
 * slower backfill, and only the operator knows what they are paying for.
 * `INDEXER_RPC_MAX_RPS_<CHAIN>` is the one variable that matters; the rest have
 * defaults that are reasonable for a public node.
 *
 * `INDEXER_RPC_BATCH_<CHAIN>` puts several JSON-RPC calls in one HTTP request.
 * Whether that helps depends on what the endpoint counts — a limiter counting
 * HTTP requests sees a fraction as many, one counting RPC calls sees no
 * difference — so it is off unless asked for.
 */
export function resolveThrottle(
	envSuffix: string,
	env: ThrottleEnv,
): (ThrottleOptions & { batch: boolean }) | null {
	const rpsName = `INDEXER_RPC_MAX_RPS_${envSuffix}`;
	const raw = trimmed(env[rpsName]);
	if (raw === undefined) return null;

	const concurrentName = `INDEXER_RPC_MAX_CONCURRENT_${envSuffix}`;
	const concurrentRaw = trimmed(env[concurrentName]);
	const batch = trimmed(env[`INDEXER_RPC_BATCH_${envSuffix}`])?.toLowerCase();

	return {
		...DEFAULT_THROTTLE,
		requestsPerSecond: positive(rpsName, raw),
		maxConcurrent:
			concurrentRaw === undefined
				? DEFAULT_THROTTLE.maxConcurrent
				: positive(concurrentName, concurrentRaw),
		batch: batch === "true" || batch === "1",
	};
}
