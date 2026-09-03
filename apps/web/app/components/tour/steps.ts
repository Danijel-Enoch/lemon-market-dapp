/**
 * The walkthrough, as data.
 *
 * Steps are keyed to `data-tour` attributes on real elements rather than to
 * coordinates or nth-child selectors, so a layout change moves the spotlight
 * with the element instead of pointing at empty space. A step whose target is
 * missing is skipped rather than blocking the tour — the board legitimately has
 * no rows when every market is unroutable, and a tour that deadlocks on that is
 * worse than one that is a step shorter.
 */
export interface TourStep {
	/** Value of the `data-tour` attribute to spotlight. */
	target: string;
	title: string;
	body: string;
	/** Route this step lives on. The tour navigates when it changes. */
	path: string;
	/** Preferred side to place the card. Falls back when it would overflow. */
	placement?: "top" | "bottom";
	/**
	 * Spotlight padding in px. Wider for elements whose visual weight extends
	 * past their box, like a row inside a bordered table.
	 */
	padding?: number;
}

export const TOUR_STEPS: TourStep[] = [
	{
		path: "/",
		target: "board-headline",
		title: "Start here",
		body: "The best net yield on the board right now, and how many markets you can actually enter. Net APY is already after fees and slippage — it is the number to compare on.",
		placement: "bottom",
	},
	{
		path: "/",
		target: "board-filters",
		title: "Stocks or crypto",
		body: "Tokenized stocks like NVDA and GOOGL, or crypto like BTC and ETH. Both work the same way: a token on Base against a perp on Pacifica.",
		placement: "bottom",
	},
	{
		path: "/",
		target: "market-row",
		title: "One row, one pair",
		body: "Net APY leads because gross funding flatters thin markets. Spread is how far the two legs sit apart, and breakeven is how long funding needs to hold to cover getting in and out. Tap a row to open it.",
		placement: "bottom",
		padding: 4,
	},
	{
		path: "/markets/:id",
		target: "market-legs",
		title: "Both legs, priced live",
		body: "This is the long side — a real token in your own wallet. The short side sits right below it. Prices come from live routes rather than an oracle, so what you see is what a fill would actually cost.",
		placement: "top",
	},
	{
		path: "/markets/:id",
		target: "ticket",
		title: "Size it, then open it",
		body: "Type a size and both legs are re-quoted at that size — slippage is not proportional, so a bigger position is not simply a bigger version of the same trade. One signature buys the spot; the hedge is placed for you.",
		placement: "top",
	},
	{
		path: "/markets/:id",
		target: "nav-portfolio",
		title: "Then watch it here",
		body: "Open positions, what they earned, and anything that needs attention — a leg that landed without its pair is flagged here rather than left to be discovered.",
		placement: "top",
		padding: 6,
	},
];
