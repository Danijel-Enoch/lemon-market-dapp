/**
 * Formatting for money, shares and time.
 *
 * All of it takes strings and `bigint`, never numbers. USDC is six decimals and
 * shares are eighteen, and a balance that passes through a float has already
 * lost precision by the time anyone reads it — which for a share balance means
 * showing someone a number their wallet disagrees with.
 */

export const USDC_DECIMALS = 6;
export const SHARE_DECIMALS = 18;

export function toBigInt(value: string | bigint | undefined | null): bigint {
	if (value === undefined || value === null) return 0n;
	return typeof value === "bigint" ? value : BigInt(value || "0");
}

/**
 * Render a fixed-point integer as a decimal string.
 *
 * Done with string surgery rather than division so nothing is rounded on the way
 * through. `maxFractionDigits` truncates rather than rounds: showing a balance
 * larger than the one that exists is the failure that matters, and rounding up
 * a withdrawable amount invites a transaction that reverts.
 */
export function formatUnits(
	value: string | bigint | undefined | null,
	decimals: number,
	maxFractionDigits = 2,
): string {
	const raw = toBigInt(value);
	const negative = raw < 0n;
	const abs = negative ? -raw : raw;

	const base = 10n ** BigInt(decimals);
	const whole = abs / base;
	const fraction = abs % base;

	const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
	const trimmed = fractionStr.replace(/0+$/, "");

	const wholeStr = whole.toLocaleString("en-US");
	const out = trimmed ? `${wholeStr}.${trimmed}` : wholeStr;
	return negative ? `-${out}` : out;
}

/** USDC, with a dollar sign. */
export function formatUsd(value: string | bigint | undefined | null, fractionDigits = 2): string {
	return `$${formatUnits(value, USDC_DECIMALS, fractionDigits)}`;
}

/**
 * USDC, abbreviated for a headline.
 *
 * Only above a thousand. "$847" is more informative than "$0.8K", and a TVL
 * figure that abbreviates small numbers reads as evasive.
 */
export function formatUsdCompact(value: string | bigint | undefined | null): string {
	const raw = toBigInt(value);
	const dollars = Number(raw / 10_000n) / 100;

	if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
	if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
	return `$${dollars.toFixed(2)}`;
}

export function formatShares(value: string | bigint | undefined | null): string {
	return formatUnits(value, SHARE_DECIMALS, 4);
}

/**
 * Parse a typed amount into fixed-point.
 *
 * Returns null on anything unparseable rather than zero — a deposit form that
 * silently reads "12..5" as nothing is worse than one that refuses.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
	const trimmed = input.trim().replace(/,/g, "");
	if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;

	const [whole = "0", fraction = ""] = trimmed.split(".");
	// Extra digits are dropped, not rounded up. Rounding up would ask the wallet
	// for more than the user typed.
	const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
	return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/**
 * A percentage, or an em dash.
 *
 * Null means "not enough history to say", which is not the same as zero. A new
 * vault showing 0.00% is making a claim about performance it has no basis for.
 */
export function formatPercent(value: number | null | undefined, fractionDigits = 2): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(fractionDigits)}%`;
}

export function formatLeverage(bps: number): string {
	const x = bps / 10_000;
	return Number.isInteger(x) ? `${x}x` : `${x.toFixed(2)}x`;
}

export function shortAddress(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * "in 3 days", "2 hours ago".
 *
 * The withdrawal flow lives or dies on this reading naturally in both
 * directions, because the same countdown is a wait before the delay elapses and
 * an overdue warning after it.
 */
export function formatRelative(timestamp: number, now = Date.now() / 1000): string {
	const delta = timestamp - now;
	const abs = Math.abs(delta);
	const future = delta > 0;

	const units: [number, string][] = [
		[86_400, "day"],
		[3_600, "hour"],
		[60, "minute"],
	];

	for (const [seconds, label] of units) {
		if (abs >= seconds) {
			const count = Math.floor(abs / seconds);
			const plural = count === 1 ? label : `${label}s`;
			return future ? `in ${count} ${plural}` : `${count} ${plural} ago`;
		}
	}
	return future ? "in under a minute" : "just now";
}

export function formatDateTime(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Value a share balance at a given price.
 *
 * `pricePerShare` is USDC per whole (1e18) share, so the scale factor is the
 * share unit rather than a decimals difference. Doing this in `bigint` keeps a
 * large holding exact.
 */
export function shareValueUsd(shares: string | bigint, pricePerShare: string | bigint): bigint {
	return (toBigInt(shares) * toBigInt(pricePerShare)) / 10n ** BigInt(SHARE_DECIMALS);
}

/** Profit and loss against what was actually paid in. */
export function unrealisedPnl(valueUsd: bigint, netDeposited: string | bigint): bigint {
	return valueUsd - toBigInt(netDeposited);
}
