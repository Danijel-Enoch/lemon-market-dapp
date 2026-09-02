/**
 * Symbol normalisation across the three systems we talk to.
 *
 *   Avantis pair     "NVDA/USD", "EUR/USD"     (separators /, -, _ all accepted upstream)
 *   Coinbase B20     "NVDAc"                   (base ticker + lowercase "c")
 *   Our canonical    "NVDA", "EUR/USD"
 *
 * Pair *indexes* are deliberately not modelled here. They are resolved at
 * runtime from `GET /v2/pairs`, because they are not stable across Avantis
 * versions — v1 documented BTC as index 0, the live v2 catalog returns ETH at
 * index 0. Hardcoding one would silently trade the wrong asset.
 */

export type AssetClass = "equity" | "fx" | "crypto" | "commodity" | "metal" | "index" | "unknown";

/**
 * Asset classes this app trades: everything Avantis lists.
 *
 * The catalog is filtered by *listing status*, not by an allowlist here, so new
 * markets appear on their own. This constant only drives UI grouping.
 */
export const TRADABLE_ASSET_CLASSES: readonly AssetClass[] = [
	"crypto",
	"equity",
	"fx",
	"commodity",
	"metal",
	"index",
] as const;

export function isTradableAssetClass(value: string | undefined): value is AssetClass {
	return TRADABLE_ASSET_CLASSES.includes(value as AssetClass);
}

/** Display grouping for the market selector. */
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
	crypto: "Crypto",
	equity: "Stocks",
	fx: "FX",
	commodity: "Commodities",
	metal: "Metals",
	index: "Indices",
	unknown: "Other",
};

/** "nvda/usd" | "NVDA-USD" | "NVDA_USD" -> "NVDA/USD" */
export function normalizePairSymbol(symbol: string): string {
	return symbol.trim().replace(/[-_]/g, "/").toUpperCase();
}

/**
 * Strip a USD quote to get the base ticker: "NVDA/USD" -> "NVDA".
 *
 * Non-USD quotes are kept whole ("USD/JPY" stays as-is) because the quote
 * currency carries meaning there. Note this cannot distinguish an equity from
 * an FX major on symbol alone — "EUR/USD" reduces to "EUR" — which is fine for
 * its only use, matching a stock token to its perp. Callers that need FX
 * semantics should branch on the market's asset class instead.
 */
export function pairToBaseTicker(pairSymbol: string): string {
	const normalized = normalizePairSymbol(pairSymbol);
	const [base, quote] = normalized.split("/");
	if (!quote) return normalized;
	return quote === "USD" ? base : normalized;
}

/** "NVDAc" -> "NVDA". Returns null when the symbol is not a B20 stock token. */
export function stockTokenToBaseTicker(tokenSymbol: string): string | null {
	const trimmed = tokenSymbol.trim();
	if (!/^[A-Z.]{1,10}c$/.test(trimmed)) return null;
	return trimmed.slice(0, -1);
}

/** "NVDA" -> "NVDAc" */
export function baseTickerToStockToken(ticker: string): string {
	return `${ticker.trim().toUpperCase()}c`;
}

/**
 * True when an Avantis pair symbol and a B20 token symbol reference the same
 * underlying company — the precondition for a cash-and-carry pairing.
 */
export function isSameUnderlying(pairSymbol: string, tokenSymbol: string): boolean {
	const ticker = stockTokenToBaseTicker(tokenSymbol);
	if (!ticker) return false;
	return pairToBaseTicker(pairSymbol) === ticker;
}
