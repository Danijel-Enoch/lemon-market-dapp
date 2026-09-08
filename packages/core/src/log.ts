/**
 * The logger both long-running processes write through.
 *
 * The agent and the API had a `console.log` each and no agreement between them,
 * which made the one question an operator actually asks — "what is this process
 * doing right now, and is it stuck?" — answerable only by reading source. Three
 * things fix that, and they are all this file is:
 *
 * **A level.** `LOG_LEVEL=debug` turns on the per-step detail without a
 * redeploy, and leaves it off by default so a normal day is readable.
 *
 * **A scope.** Every line says which process and which vault it came from, so
 * `grep 0xabc` returns one vault's whole story out of a shared stream.
 *
 * **A span.** Anything that takes time announces its start, and prints its own
 * duration when it ends. A tick that never prints its end line is a tick that
 * is still running — which is the difference between "the agent is wedged" and
 * "the bridge is taking its usual eleven minutes", and no amount of one-shot
 * logging distinguishes those two.
 *
 * `LOG_FORMAT=json` switches to one JSON object per line for log shippers.
 * Colour is used only on a TTY, so redirected output stays clean.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** A unit of work that reports its own duration. */
export interface Span {
	/** Close the span successfully. Returns the elapsed milliseconds. */
	end(message?: string, extra?: unknown): number;
	/** Close the span as failed, at error level. Returns the elapsed milliseconds. */
	fail(error: unknown, message?: string): number;
	/** Elapsed milliseconds so far, without closing. */
	elapsed(): number;
}

export interface SpanOptions {
	/** Level for the start and end lines. Defaults to `info`. */
	level?: LogLevel;
	/** Context attached to the start line. */
	extra?: unknown;
}

export interface Logger {
	/** The dotted scope this logger prefixes its lines with. */
	readonly scope: string;
	debug(message: string, extra?: unknown): void;
	info(message: string, extra?: unknown): void;
	warn(message: string, extra?: unknown): void;
	error(message: string, extra?: unknown): void;
	/**
	 * Level-as-argument form.
	 *
	 * Bound to the logger, so it can be handed straight to code that takes a
	 * `(level, message, extra)` callback — which is how the agent's worker,
	 * bridge and venue adapters receive theirs.
	 */
	emit(level: LogLevel, message: string, extra?: unknown): void;
	/** A logger writing under `parent.scope:scope`. */
	child(scope: string): Logger;
	/** Announce the start of a unit of work; the returned span prints its end. */
	span(name: string, options?: SpanOptions): Span;
	/** Whether a level would currently be printed. Guard expensive formatting with it. */
	enabled(level: LogLevel): boolean;
}

export interface LoggerOptions {
	/** Minimum level to print. Defaults to `LOG_LEVEL`, then `info`. */
	level?: LogLevel;
	/** One JSON object per line. Defaults to `LOG_FORMAT=json`. */
	json?: boolean;
	/** ANSI colour. Defaults to on when stdout is a TTY and `NO_COLOR` is unset. */
	color?: boolean;
}

export function parseLogLevel(raw: string | undefined, fallback: LogLevel = "info"): LogLevel {
	const value = raw?.trim().toLowerCase();
	return value === "debug" || value === "info" || value === "warn" || value === "error"
		? value
		: fallback;
}

/**
 * Milliseconds as something a human reads at a glance.
 *
 * Exported because durations show up in messages the caller composes itself,
 * and two spellings of the same number in one stream is worse than none.
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

const COLORS = {
	reset: "\u001b[0m",
	dim: "\u001b[2m",
	bold: "\u001b[1m",
	red: "\u001b[31m",
	yellow: "\u001b[33m",
	cyan: "\u001b[36m",
	gray: "\u001b[90m",
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
	debug: COLORS.gray,
	info: COLORS.cyan,
	warn: COLORS.yellow,
	error: COLORS.red,
};

/**
 * `JSON.stringify` that survives this codebase's values.
 *
 * Every amount here is a `bigint`, and the default serialiser throws on one —
 * so a plain stringify in a log line turns a diagnostic into a second failure,
 * inside the code that was reporting the first.
 */
function serialize(value: unknown): string {
	try {
		return JSON.stringify(value, (_key, val) =>
			typeof val === "bigint" ? `${val.toString()}n` : val,
		);
	} catch {
		return String(value);
	}
}

/** Render the trailing context of a line: an error's message, or a value. */
function describeExtra(extra: unknown): string {
	if (extra === undefined || extra === null || extra === "") return "";
	if (extra instanceof Error) return extra.stack ?? `${extra.name}: ${extra.message}`;
	if (typeof extra === "string") return extra;
	return serialize(extra) ?? "";
}

function extraForJson(extra: unknown): unknown {
	if (extra === undefined) return undefined;
	if (extra instanceof Error) {
		return { name: extra.name, message: extra.message, stack: extra.stack };
	}
	return extra;
}

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
	const env = typeof process === "undefined" ? undefined : process.env;
	const minimum = RANK[options.level ?? parseLogLevel(env?.LOG_LEVEL)];
	const json = options.json ?? env?.LOG_FORMAT?.trim().toLowerCase() === "json";
	const color =
		options.color ??
		(!json && !env?.NO_COLOR && typeof process !== "undefined" && Boolean(process.stdout?.isTTY));

	function paint(text: string, ansi: string): string {
		return color ? `${ansi}${text}${COLORS.reset}` : text;
	}

	function write(level: LogLevel, message: string, extra?: unknown): void {
		if (RANK[level] < minimum) return;

		const timestamp = new Date().toISOString();
		const line = json
			? serialize({
					time: timestamp,
					level,
					scope,
					message,
					...(extra === undefined ? {} : { extra: extraForJson(extra) }),
				})
			: [
					paint(timestamp, COLORS.dim),
					paint(level.toUpperCase().padEnd(5), LEVEL_COLOR[level]),
					paint(scope, COLORS.bold),
					message,
				].join(" ");

		const context = json ? "" : describeExtra(extra);
		const rendered = context ? `${line} ${context}` : line;

		// stderr for warn and error so a shell redirect can keep them apart, which
		// is what makes `2>` a usable filter for "did anything go wrong".
		if (level === "error" || level === "warn") console.error(rendered);
		else console.log(rendered);
	}

	const logger: Logger = {
		scope,
		debug: (message, extra) => write("debug", message, extra),
		info: (message, extra) => write("info", message, extra),
		warn: (message, extra) => write("warn", message, extra),
		error: (message, extra) => write("error", message, extra),
		emit: (level, message, extra) => write(level, message, extra),
		enabled: (level) => RANK[level] >= minimum,
		// The resolved settings are passed down rather than the caller's, so a
		// child does not re-read the environment and cannot end up at a different
		// level from the parent it was branched off.
		child: (childScope) =>
			createLogger(`${scope}:${childScope}`, {
				level: options.level ?? parseLogLevel(env?.LOG_LEVEL),
				json,
				color,
			}),
		span(name, spanOptions = {}) {
			const level = spanOptions.level ?? "info";
			const startedAt = performance.now();
			write(level, `▶ ${name} started`, spanOptions.extra);

			let closed = false;
			const elapsed = () => performance.now() - startedAt;

			return {
				elapsed,
				end(message, extra) {
					const ms = elapsed();
					// Guarded because a span closed twice would report a duration
					// measured from a start line that is no longer on screen, and the
					// second, longer number is the one an operator would believe.
					if (!closed) {
						closed = true;
						write(
							level,
							`■ ${name} finished in ${formatDuration(ms)}${message ? ` — ${message}` : ""}`,
							extra,
						);
					}
					return ms;
				},
				fail(error, message) {
					const ms = elapsed();
					if (!closed) {
						closed = true;
						write(
							"error",
							`✖ ${name} failed after ${formatDuration(ms)}${message ? ` — ${message}` : ""}`,
							error,
						);
					}
					return ms;
				},
			};
		},
	};

	return logger;
}
