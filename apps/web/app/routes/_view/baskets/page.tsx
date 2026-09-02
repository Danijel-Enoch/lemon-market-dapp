import { redirect } from "react-router";

/**
 * Baskets use the same single-terminal pattern as /trade: one page with a
 * selector, rather than a list that would duplicate the dropdown.
 */
export const DEFAULT_BASKET = "blue-chip";

export function loader() {
	return redirect(`/baskets/${DEFAULT_BASKET}`);
}

export default function BasketsIndexRedirect() {
	return null;
}
