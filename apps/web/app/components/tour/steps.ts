/**
 * The walkthrough, as data.
 *
 * Steps are keyed to `data-tour` attributes on real elements rather than to
 * coordinates or nth-child selectors, so a layout change moves the spotlight
 * with the element instead of pointing at empty space. A step whose target is
 * missing is skipped rather than blocking the tour — a deployment with no vaults
 * yet legitimately has no rows, and a tour that deadlocks on that is worse than
 * one that is a step shorter.
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
		title: "Deposit, and that's it",
		body: "Each vault runs one delta-neutral position for you. You put USDC in and hold a share token; an agent does the trading. There is no ticket to fill in and no leg to manage.",
		placement: "bottom",
	},
	{
		path: "/",
		target: "board-filters",
		title: "Two risk levels",
		body: "A no-leverage vault holds a fully collateralised short — it cannot be liquidated by a price move. A leveraged one runs 2–3x, which multiplies the yield and introduces a liquidation price. The tier is fixed when the vault is created.",
		placement: "bottom",
	},
	{
		path: "/",
		target: "vault-row",
		title: "Yield you can check",
		body: "The percentage is what this vault's share price actually did over the last week, annualised — not a projection from today's funding rate. A vault too new to measure shows a dash rather than a flattering guess.",
		placement: "bottom",
		padding: 4,
	},
	{
		path: "/activity",
		target: "activity-feed",
		title: "Watch the agent work",
		body: "Every trade, bridge and transfer an agent makes is published here, on whichever chain it happened on, with a link to the transaction. This is open to anyone — no wallet needed.",
		placement: "top",
	},
	{
		path: "/activity",
		target: "nav-portfolio",
		title: "Your side of it",
		body: "Your shares, what they are worth, and any withdrawal moving through the queue. Withdrawals take 3 to 7 days because the agent has to unwind a real position to pay you — the countdown lives here.",
		placement: "bottom",
		padding: 6,
	},
];
