import { redirect } from "react-router";

/**
 * The portfolio page became /accounts.
 *
 * Positions moved to Pacifica, which is an account the app manages rather than
 * the connected wallet, so "portfolio" no longer described what the page shows.
 * The redirect stays because the old path is bookmarked and linked to.
 */
export function loader() {
	return redirect("/accounts");
}

export default function PortfolioRedirect() {
	return null;
}
