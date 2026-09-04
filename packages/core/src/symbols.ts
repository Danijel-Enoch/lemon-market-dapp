/**
 * Symbol normalisation across the systems we talk to.
 *
 *   Pacifica market   "NVDA", "BTC"             (base only; USD is implied)
 *   Display pair      "NVDA/USD", "EUR/USD"     (separators /, -, _ all accepted)
 *   Coinbase B20      "NVDAc"                   (base ticker + lowercase "c")
 *   Our canonical     "NVDA", "EUR/USD"
 *
 * Markets are addressed by symbol everywhere, never by a numeric index. Venue
 * indexes are not stable across protocol versions — a persisted one can end up
 * naming a different asset after an upgrade, and trade it without complaint.
 */

export type AssetClass =
	| "equity"
	| "fx"
	| "crypto"
	| "rwa"
	| "commodity"
	| "metal"
	| "index"
	| "unknown";

/**
 * Asset classes this app trades: everything Pacifica lists.
 *
 * The catalog is filtered by *listing status*, not by an allowlist here, so new
 * markets appear on their own. This constant only drives UI grouping.
 */
export const TRADABLE_ASSET_CLASSES: readonly AssetClass[] = [
	"crypto",
	"equity",
	"rwa",
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
	rwa: "RWA",
	fx: "FX",
	commodity: "Commodities",
	metal: "Metals",
	index: "Indices",
	unknown: "Other",
};

/**
 * The four groups the vault board filters by.
 *
 * Coarser than `AssetClass` on purpose. A depositor choosing between vaults is
 * asking "what kind of thing is this" — and metals, commodities and tokenized
 * treasuries all answer that the same way, while splitting them across three
 * tabs would leave most of the tabs empty most of the time.
 *
 * Stocks stay separate from the rest of RWA even though a tokenized equity is
 * literally a real-world asset, because it is the category people actually look
 * for by name.
 */
export const ASSET_GROUPS = ["crypto", "stocks", "rwa", "fx"] as const;
export type AssetGroup = (typeof ASSET_GROUPS)[number];

export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
	crypto: "Crypto",
	stocks: "Stocks",
	rwa: "RWA",
	fx: "FX",
};

const GROUP_BY_CLASS: Record<AssetClass, AssetGroup> = {
	crypto: "crypto",
	equity: "stocks",
	rwa: "rwa",
	commodity: "rwa",
	metal: "rwa",
	index: "rwa",
	fx: "fx",
	// Anything unrecognised lands in RWA rather than vanishing from every tab.
	// A vault the board cannot categorise must still be reachable.
	unknown: "rwa",
};

export function assetGroupFor(assetClass: AssetClass): AssetGroup {
	return GROUP_BY_CLASS[assetClass] ?? "rwa";
}

/**
 * The listed universe, classified.
 *
 * A vault knows only `keccak256(ticker)` on-chain, so its category has to come
 * from somewhere off-chain. This is that somewhere: curated by asset, never
 * inferred from the shape of a symbol. A four-letter ticker is not evidence of
 * anything — DOGE and NVDA look identical to a heuristic and belong in different
 * tabs.
 */
const ASSET_CLASS_BY_TICKER: Record<string, AssetClass> = {
	// Crypto with a Base spot leg and a listed perp.
	BTC: "crypto",
	ETH: "crypto",
	SOL: "crypto",
	LINK: "crypto",
	AAVE: "crypto",
	CRV: "crypto",
	ENA: "crypto",
	ZRO: "crypto",
	VIRTUAL: "crypto",
	VVV: "crypto",
	KAITO: "crypto",
	AERO: "crypto",
	DOGE: "crypto",
	FARTCOIN: "crypto",

	// Coinbase B20 tokenized equities.
	NVDA: "equity",
	GOOGL: "equity",
	TSLA: "equity",
	MSTR: "equity",
	AAPL: "equity",
	MSFT: "equity",
	META: "equity",
	COIN: "equity",
	AMZN: "equity",
	INTC: "equity",
	STRK: "equity",

	// Metals and commodities, which the board groups as RWA.
	XAU: "metal",
	XAG: "metal",
	WTI: "commodity",

	// Majors.
	"EUR/USD": "fx",
	"GBP/USD": "fx",
	"USD/JPY": "fx",
};

/**
 * Classify a ticker, or say so.
 *
 * Returns `"unknown"` rather than guessing. A wrong class puts a vault in the
 * wrong tab, which is cosmetic — but the same guessing habit applied to a token
 * address hedges a position against the wrong asset, so the rule is the same
 * everywhere: curate, never infer.
 */
export function assetClassForTicker(ticker: string | null | undefined): AssetClass {
	if (!ticker) return "unknown";
	return ASSET_CLASS_BY_TICKER[normalizePairSymbol(ticker)] ?? "unknown";
}

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
 * True when an the reference design pair symbol and a B20 token symbol reference the same
 * underlying company — the precondition for a cash-and-carry pairing.
 */
export function isSameUnderlying(pairSymbol: string, tokenSymbol: string): boolean {
	const ticker = stockTokenToBaseTicker(tokenSymbol);
	if (!ticker) return false;
	return pairToBaseTicker(pairSymbol) === ticker;
}
