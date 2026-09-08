import { BPS } from "@lemon/contracts";

/**
 * What the deployed capital is worth.
 *
 * This is the number the whole vault prices off, and the only unverifiable input
 * the contract accepts — so the rules here are about being conservative and
 * being legible, in that order.
 *
 * Four components, each read from the venue that owns it:
 *
 *  - **Spot** — the token balances, each valued at an *executable sell* quote
 *    rather than a mid or an oracle. A tokenized equity on a thin Aerodrome pool
 *    can show a mid several percent above what a sale would actually clear, and
 *    a NAV built on mids reports a vault richer than it can liquidate.
 *  - **Perp equity** — the Pacifica account's own figure, which already nets
 *    unrealised P&L and accrued funding.
 *  - **Idle at the agent** — USDC that has left the vault but not yet reached a
 *    venue. Real money, and omitting it would make every deployment look like an
 *    instant loss.
 *  - **In flight** — value mid-bridge, belonging to neither chain for a few
 *    minutes. This is the one that has to be tracked rather than read.
 *
 * **Only the spot component is per-market.** A vault running several markets
 * holds several token balances on Base, but one Pacifica account, one Base
 * wallet and one Solana wallet — so equity, idle USDC and in-flight capital are
 * counted once for the vault and never once per market. Summing per-market
 * valuations instead would multiply the shared balances by the number of
 * markets, and a three-market vault would report roughly triple its margin as
 * NAV. That is the mistake this shape exists to make impossible.
 */
export interface SpotLegInputs {
	/** The market this leg belongs to, for the error message and the breakdown. */
	ticker: string;
	/** Spot tokens held by the agent wallet, in the token's own decimals. */
	spotTokenBalance: bigint;
	spotTokenDecimals: number;
	/**
	 * USDC returned by an executable sell quote for the *entire* holding.
	 * Null when the pool cannot be routed, which is a valuation failure rather
	 * than a zero.
	 */
	spotSellQuoteUsdc: bigint | null;
}

export interface ValuationInputs {
	/** One entry per market the vault holds a spot leg in. */
	legs: SpotLegInputs[];

	/** Pacifica account equity, in USDC units. Account-level, across every symbol. */
	perpEquityUsdc: bigint;
	/** Notional of every open short added together, for the leverage figure. */
	perpNotionalUsdc: bigint;

	/** USDC sitting at the agent's own wallets, on either chain. */
	idleAtAgentUsdc: bigint;
	/** Value known to be mid-bridge, from the agent's own bridge records. */
	inFlightUsdc: bigint;
}

export interface Valuation {
	deployedAssets: bigint;
	leverageBps: number;
	components: {
		/** Every spot leg added together. */
		spot: bigint;
		perpEquity: bigint;
		idleAtAgent: bigint;
		inFlight: bigint;
	};
	/**
	 * The two figures `leverageBps` is the ratio of, carried alongside it.
	 *
	 * Not redundant with the ratio. A ratio says how far the account is from its
	 * ceiling; it cannot say how many dollars of margin would move it, and the
	 * policy has to size that top-up in integer USDC rather than by scaling a
	 * rounded bps figure back into money.
	 *
	 * `perpNotional` is not part of `deployedAssets` and deliberately sits outside
	 * `components`: notional is exposure, not value. Adding it to the NAV would
	 * count the hedge twice — once as the margin backing it and once as the size
	 * it carries.
	 */
	perp: {
		notional: bigint;
		equity: bigint;
	};
	/** What each market's spot leg is worth, keyed by ticker. Drives the weights. */
	spotByMarket: Record<string, bigint>;
}

export class ValuationError extends Error {}

/**
 * Total the components, or refuse.
 *
 * An unroutable spot leg throws rather than contributing zero. A vault whose
 * spot pool has dried up is not worth its perp equity alone — it is worth an
 * unknown amount, and reporting the knowable part as the whole would mark down
 * every holder by the value of the token nobody can currently price. Failing
 * here stales the NAV, which blocks deposits and fulfilments until a human
 * looks. That is the correct outcome; it is not a silent one.
 *
 * **One unpriceable market stales the whole vault**, and that stays true however
 * many markets there are. The temptation with several is to price the ones that
 * can be priced and carry on, since most of the vault is still knowable — but
 * the NAV is a single number for a single share price, and a vault reporting
 * four of its five legs is reporting a number that is wrong by the fifth. Every
 * holder is marked down by it, and deposits at that price are struck against
 * depositors who are already in.
 */
export function value(inputs: ValuationInputs): Valuation {
	const unpriceable = inputs.legs.filter(
		(leg) => leg.spotTokenBalance > 0n && leg.spotSellQuoteUsdc === null,
	);
	if (unpriceable.length > 0) {
		throw new ValuationError(
			`The ${unpriceable.map((leg) => leg.ticker).join(", ")} spot ${
				unpriceable.length === 1 ? "leg holds tokens" : "legs hold tokens"
			} but cannot be routed to a sell quote, so the position cannot be priced. Reporting the rest as the whole would understate NAV by ${
				unpriceable.length === 1 ? "that leg" : "those legs"
			}.`,
		);
	}

	const spotByMarket: Record<string, bigint> = {};
	let spot = 0n;
	for (const leg of inputs.legs) {
		const legValue = leg.spotSellQuoteUsdc ?? 0n;
		spotByMarket[leg.ticker] = legValue;
		spot += legValue;
	}

	const deployedAssets =
		spot + inputs.perpEquityUsdc + inputs.idleAtAgentUsdc + inputs.inFlightUsdc;

	return {
		deployedAssets,
		leverageBps: leverageBps(inputs.perpNotionalUsdc, inputs.perpEquityUsdc),
		components: {
			spot,
			perpEquity: inputs.perpEquityUsdc,
			idleAtAgent: inputs.idleAtAgentUsdc,
			inFlight: inputs.inFlightUsdc,
		},
		perp: {
			notional: inputs.perpNotionalUsdc,
			equity: inputs.perpEquityUsdc,
		},
		spotByMarket,
	};
}

/**
 * Leverage on the perp legs: total notional over the margin backing them.
 *
 * Account-level, because Pacifica's margin is. A vault short three symbols in
 * one account is levered on the sum of the three notionals against the one
 * equity, which is also the number the venue liquidates against — measuring any
 * symbol on its own would report a figure the contract's mandate check and the
 * venue's margin engine both disagree with.
 *
 * **Both sides are marked to market, so this drifts on price alone.** Notional
 * is `size × mark`, and equity already nets unrealised P&L — so a short whose
 * underlying rises gains notional and loses equity at the same time. A position
 * opened at exactly `N` notional against exactly `N` of margin reads
 *
 *     (1 + p) / (1 - p)  ≈  1 + 2p
 *
 * after a move of `p`, which is 10025 bps on a rise of an eighth of a percent —
 * and the taker fee on opening the short puts it above 1x before any move at
 * all. That is not a mandate breach and it is not a measurement error: it is
 * what a fully collateralised short does, and the spot leg is up by exactly what
 * the perp leg is down. It is reported honestly anyway, because this figure is
 * what the contract stores and what depositors read, and a leveraged vault
 * genuinely does approach liquidation as it rises.
 *
 * What keeps it inside the mandate is the *sizing*, not the measurement: the
 * agent opens the hedge with margin to spare, so the ratio starts below the
 * ceiling with room to drift into. See `sizingLeverageBps` in `policy.ts`.
 *
 * Reported to the contract, which rejects anything above the vault's mandate.
 * Equity of zero with an open notional is not infinite leverage in any useful
 * sense — it is a position about to be liquidated — so it is clamped to the
 * ceiling the contract will accept a report at, and the operator sees a maxed
 * figure rather than a report that reverts and stales the vault.
 */
export function leverageBps(notionalUsdc: bigint, equityUsdc: bigint): number {
	if (notionalUsdc === 0n) return BPS;
	if (equityUsdc <= 0n) return Number.MAX_SAFE_INTEGER;
	return Number((notionalUsdc * BigInt(BPS)) / equityUsdc);
}

/**
 * Scale a token balance to 1e18, for comparing legs in units.
 *
 * The two legs report in different decimals — a 6dp token against an 18dp perp
 * size — and comparing them raw reports enormous drift on a perfectly neutral
 * position.
 */
export function toUnits(balance: bigint, decimals: number): bigint {
	if (decimals === 18) return balance;
	return decimals < 18
		? balance * 10n ** BigInt(18 - decimals)
		: balance / 10n ** BigInt(decimals - 18);
}

/**
 * The inverse: a 1e18 unit count back into a token's own decimals.
 *
 * Needed wherever a size that came from the *perp* leg has to be handed to
 * something denominated in the *spot* token — closing a position in full, most
 * of all, where the number that has to reach zero is the venue's and the number
 * that gets sold is the wallet's. Getting the direction wrong is not a rounding
 * matter: an 8-decimal token off by ten orders of magnitude is an order for a
 * size nobody holds, which either reverts or, worse, does not.
 */
export function fromUnits(units: bigint, decimals: number): bigint {
	if (decimals === 18) return units;
	return decimals < 18
		? units / 10n ** BigInt(18 - decimals)
		: units * 10n ** BigInt(decimals - 18);
}
