/**
 * Unit conversion helpers.
 *
 * Note the asymmetry these exist to manage: the Avantis tx-builder API takes
 * *human* units (`collateralUsdc: 100`, `leverage: 10`), while KyberSwap and
 * every ERC-20 call take base units (`100000000`). Mixing the two silently
 * trades 1e6x the intended size, so conversions live here rather than inline.
 */

/** Convert a human amount to base units, truncating excess precision. */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
	const raw = typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
	if (raw === "" || raw === "." || Number.isNaN(Number(raw))) return 0n;

	const negative = raw.startsWith("-");
	const unsigned = negative ? raw.slice(1) : raw;
	const [whole = "0", fraction = ""] = unsigned.split(".");
	const padded = fraction.slice(0, decimals).padEnd(decimals, "0");
	const value = BigInt(`${whole || "0"}${padded || ""}`);
	return negative ? -value : value;
}

/** Convert base units back to a human decimal string (no thousands separators). */
export function fromBaseUnits(value: bigint | string, decimals: number): string {
	const raw = typeof value === "string" ? BigInt(value) : value;
	const negative = raw < 0n;
	const abs = negative ? -raw : raw;
	const divisor = 10n ** BigInt(decimals);
	const whole = abs / divisor;
	const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
	const text = fraction ? `${whole}.${fraction}` : `${whole}`;
	return negative ? `-${text}` : text;
}

/** Base units to a JS number. Only for display and ratio math, never for sizing. */
export function toNumber(value: bigint | string, decimals: number): number {
	return Number(fromBaseUnits(value, decimals));
}

export function formatUsd(value: number, opts: { compact?: boolean } = {}): string {
	if (!Number.isFinite(value)) return "—";
	if (opts.compact && Math.abs(value) >= 1_000_000) {
		return `$${(value / 1_000_000).toFixed(2)}M`;
	}
	if (opts.compact && Math.abs(value) >= 1_000) {
		return `$${(value / 1_000).toFixed(2)}K`;
	}
	const digits = Math.abs(value) >= 1 ? 2 : 4;
	return `$${value.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	})}`;
}

export function formatPercent(value: number, digits = 2): string {
	if (!Number.isFinite(value)) return "—";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(digits)}%`;
}

export function formatQuantity(value: number, digits = 4): string {
	if (!Number.isFinite(value)) return "—";
	return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const HOURS_PER_YEAR = 24 * 365;

/**
 * Annualise a funding rate quoted as percent-per-hour.
 *
 * Upstream quotes funding hourly, where a typical value reads as 0.00062% —
 * small enough to look like noise. Annualising turns that into 5.43%, which is
 * the number a holder can actually reason about against any other yield.
 */
export function annualizeFundingRate(percentPerHour: number): number {
	return percentPerHour * HOURS_PER_YEAR;
}

/**
 * Format an hourly funding rate as an annual percentage.
 *
 * The sign is preserved deliberately: on Avantis a positive rate means the side
 * *receives* funding and negative means it pays, so dropping the sign would
 * invert the meaning.
 */
export function formatFundingApr(percentPerHour: number, digits = 2): string {
	if (!Number.isFinite(percentPerHour)) return "—";
	return formatPercent(annualizeFundingRate(percentPerHour), digits);
}

/** Basis points to a percentage (10 bps -> 0.1). */
export function bpsToPercent(bps: number): number {
	return bps / 100;
}

/** Percentage to basis points, clamped to KyberSwap's accepted 0..2000 range. */
export function percentToBps(percent: number): number {
	return Math.max(0, Math.min(2000, Math.round(percent * 100)));
}
