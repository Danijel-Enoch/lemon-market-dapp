import type { Market } from "@lemon/core";
import { TtlCache } from "../cache";
import { clients } from "../config";

/**
 * The Avantis pair catalog, kept only for the legacy perp routes.
 *
 * Market data now comes from Pacifica (see `./markets`). Avantis positions are
 * still keyed by pair index, so labelling them needs the Avantis catalog rather
 * than the Pacifica one — these are different venues with different
 * identifiers, and resolving one against the other would put the wrong ticker
 * on a position.
 *
 * This module exists to keep that separation explicit while the Pacifica order
 * flow is built out.
 */
const catalogCache = new TtlCache<Market[]>(() => clients.avantis.getMarkets(), 60_000);

/** Label Avantis positions without a second catalog fetch. */
export async function getAvantisSymbolResolver(): Promise<
	(pairIndex: number) => string | undefined
> {
	const markets = await catalogCache.get();
	const byIndex = new Map(markets.map((market) => [market.pairIndex, market.symbol]));
	return (pairIndex: number) => byIndex.get(pairIndex);
}

export function invalidateAvantisMarkets(): void {
	catalogCache.invalidate();
}
