import { redirect } from "react-router";

/**
 * Trading lives on a single terminal page with a market selector, so the bare
 * /trade path resolves to a default market rather than rendering a second,
 * competing market list.
 */
export const DEFAULT_MARKET = "BTC-USD";

export function loader() {
	return redirect(`/trade/${DEFAULT_MARKET}`);
}

export default function TradeIndexRedirect() {
	return null;
}
