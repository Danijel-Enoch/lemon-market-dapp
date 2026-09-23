import type { AssetClass } from "@lemon/core";
import { cn } from "@lemon/ui";
import { useState } from "react";

/** ISO currency code -> flag emoji, for FX markets. */
const CURRENCY_FLAGS: Record<string, string> = {
	USD: "🇺🇸",
	EUR: "🇪🇺",
	GBP: "🇬🇧",
	JPY: "🇯🇵",
	CAD: "🇨🇦",
	CHF: "🇨🇭",
	SEK: "🇸🇪",
	AUD: "🇦🇺",
	NZD: "🇳🇿",
	SGD: "🇸🇬",
	CNH: "🇨🇳",
};

const COMMODITY_GLYPHS: Record<string, string> = {
	XAU: "🥇",
	XAG: "🥈",
	WTI: "🛢️",
	BRENT: "🛢️",
};

/**
 * Asset class, marked by the frame rather than by a hue.
 *
 * The tinted discs this replaced were built for a dark ground — sky-300 on a
 * 15% fill disappears entirely on the lime field. The system has one tint, the
 * cream, so class is carried by the edge instead: a rule for the classes that
 * trade on a calendar, a solid for the ones that trade continuously.
 */
const CLASS_FRAMES: Record<string, string> = {
	crypto: "border-[var(--pon-ink)] bg-[var(--pon-ink)] text-[var(--pon-on-lime)]",
	equity: "border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] text-[var(--pon-ink)]",
	fx: "border-[var(--pon-line-2)] bg-[var(--pon-lime-dim)] text-[var(--pon-ink)]",
	commodity: "border-[var(--pon-line-2)] bg-transparent text-[var(--pon-ink)]",
	metal: "border-[var(--pon-line-2)] bg-transparent text-[var(--pon-ink)]",
	index: "border-[var(--pon-line-2)] bg-transparent text-[var(--pon-ink)]",
	unknown: "border-[var(--pon-line)] bg-transparent text-[var(--pon-fg-2)]",
};

/**
 * Market icon with a layered fallback.
 *
 * 1. A logo from the curated token list, when we hold the token's address.
 * 2. A glyph for FX and commodities, derived from the currency code.
 * 3. A monogram tinted by asset class.
 *
 * There is deliberately no symbol-keyed icon CDN in that chain. Guessing a logo
 * from a ticker is how a market ends up showing another project's brand, and a
 * plain monogram is better than a confidently wrong image.
 */
export function MarketLogo({
	symbol,
	base,
	assetClass,
	logoUrl,
	size = 28,
	className,
}: {
	symbol: string;
	base?: string;
	assetClass?: AssetClass;
	logoUrl?: string | null;
	size?: number;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	const ticker = (base ?? symbol.split("/")[0] ?? symbol).toUpperCase();

	const glyph =
		assetClass === "fx" ? CURRENCY_FLAGS[ticker] : (COMMODITY_GLYPHS[ticker] ?? undefined);

	const box = { width: size, height: size };

	if (logoUrl && !failed) {
		return (
			<img
				src={logoUrl}
				alt=""
				aria-hidden
				width={size}
				height={size}
				onError={() => setFailed(true)}
				className={cn(
					"shrink-0 rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-paper)] object-cover",
					className,
				)}
				style={box}
			/>
		);
	}

	if (glyph) {
		return (
			<span
				aria-hidden
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-paper)]",
					className,
				)}
				style={{ ...box, fontSize: size * 0.55 }}
			>
				{glyph}
			</span>
		);
	}

	return (
		<span
			aria-hidden
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[var(--pon-r-sm)] border font-mono font-bold tracking-[-0.04em]",
				CLASS_FRAMES[assetClass ?? "unknown"],
				className,
			)}
			style={{ ...box, fontSize: size * 0.36 }}
		>
			{ticker.slice(0, 3)}
		</span>
	);
}
