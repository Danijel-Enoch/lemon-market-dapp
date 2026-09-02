import { redirect } from "react-router";

/**
 * Spot and perp share one terminal, toggled per market, so /spot forwards there
 * rather than maintaining a separate surface that would drift out of sync.
 */
export function loader() {
	return redirect("/trade/BTC-USD");
}

export default function SpotIndexRedirect() {
	return null;
}
