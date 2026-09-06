/**
 * The walkthrough, as data.
 *
 * Steps are keyed to `data-tour` attributes on real elements rather than to
 * coordinates or nth-child selectors, so a layout change moves the spotlight
 * with the element instead of pointing at empty space. A step whose target is
 * missing is skipped rather than blocking the tour — a deployment with no vaults
 * yet legitimately has no rows, and a tour that deadlocks on that is worse than
 * one that is a step shorter.
 *
 * The route it walks is board → one vault → activity → portfolio, which is the
 * order someone actually moves through: what is on offer, how to buy it, how to
 * check what was bought, and where their own position lives. The vault step uses
 * a `:id` path, resolved at runtime to whichever vault the board is showing
 * first, because the tour cannot know an address that only exists on-chain.
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
		path: "/vaults",
		target: "board-headline",
		title: "Nothing here takes a side",
		body: "Every vault owns a real asset — NVDA, BTC — and hedges the same size against it, so a price move gains on one leg what it loses on the other. These four numbers are the whole protocol: what has been deposited, how much of it is working, and how many people are in.",
		placement: "bottom",
	},
	{
		path: "/vaults",
		target: "board-filters",
		title: "Narrow it two ways",
		body: "The top row is what a vault holds, with a count on each so an empty category looks empty rather than broken. The second is risk: a no-leverage vault is fully collateralised and has no liquidation price, a leveraged one runs 2–3x and has one. The tier is fixed when the vault is created.",
		placement: "bottom",
	},
	{
		path: "/vaults",
		target: "vault-row",
		title: "Projected, then realised",
		body: "Projected is what a vault would pay if today's funding rate held, after its idle buffer, venue costs and both fees. The realised columns are measured instead — what the share price actually did — and show a dash when there is too little history. The board ranks by realised, never by the projection.",
		placement: "bottom",
		padding: 4,
	},
	{
		path: "/vaults/:id",
		target: "deposit-panel",
		title: "This is the whole interaction",
		body: "Type an amount. Shares are minted immediately at the vault's current price, and you see what you receive and how long a withdrawal takes before you sign anything. A paused vault, or one waiting on a valuation, says so here rather than failing after you commit.",
		placement: "top",
	},
	{
		path: "/activity",
		target: "activity-feed",
		title: "Check the agent's work",
		body: "Every fill, bridge and transfer is published here with a link to the transaction on the chain it happened on. Base cannot verify a Pacifica fill, so each row carries its own verification state rather than being presented as settled. Open to anyone, no wallet needed.",
		placement: "top",
	},
	{
		path: "/activity",
		target: "nav-portfolio",
		title: "Your side of it",
		body: "Your shares, what they are worth, and any withdrawal moving through the queue. Withdrawals take 3 to 7 days because the agent has to unwind a real position to pay you, and your shares keep earning until it does. The countdown lives here.",
		placement: "bottom",
		padding: 6,
	},
];
