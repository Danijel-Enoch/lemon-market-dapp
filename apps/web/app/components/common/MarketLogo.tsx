import { cn } from "@app/lib/utils";
import type { AssetClass } from "@lemon/core";
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

/** Deterministic tint so monograms are distinguishable but never random. */
const CLASS_TINTS: Record<string, string> = {
	crypto: "bg-[var(--pon-amber)]/15 text-[var(--pon-amber)]",
	equity: "bg-sky-500/15 text-sky-300",
	fx: "bg-violet-500/15 text-violet-300",
	commodity: "bg-orange-500/15 text-orange-300",
	metal: "bg-yellow-500/15 text-yellow-300",
	index: "bg-emerald-500/15 text-emerald-300",
	unknown: "bg-white/10 text-[var(--pon-fg)]",
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
				className={cn("shrink-0 rounded-full bg-[var(--pon-surface-2)] object-cover", className)}
				style={box}
			/>
		);
	}

	if (glyph) {
		return (
			<span
				aria-hidden
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--pon-surface-2)]",
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
				"inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
				CLASS_TINTS[assetClass ?? "unknown"],
				className,
			)}
			style={{ ...box, fontSize: size * 0.36 }}
		>
			{ticker.slice(0, 3)}
		</span>
	);
}
