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
 *  - **Spot** — the token balance, valued at an *executable sell* quote rather
 *    than a mid or an oracle. A tokenized equity on a thin Aerodrome pool can
 *    show a mid several percent above what a sale would actually clear, and a
 *    NAV built on mids reports a vault richer than it can liquidate.
 *  - **Perp equity** — the Pacifica account's own figure, which already nets
 *    unrealised P&L and accrued funding.
 *  - **Idle at the agent** — USDC that has left the vault but not yet reached a
 *    venue. Real money, and omitting it would make every deployment look like an
 *    instant loss.
 *  - **In flight** — value mid-bridge, belonging to neither chain for a few
 *    minutes. This is the one that has to be tracked rather than read.
 */
export interface ValuationInputs {
	/** Spot tokens held by the agent wallet, in the token's own decimals. */
	spotTokenBalance: bigint;
	spotTokenDecimals: number;
	/**
	 * USDC returned by an executable sell quote for the *entire* holding.
	 * Null when the pool cannot be routed, which is a valuation failure rather
	 * than a zero.
	 */
	spotSellQuoteUsdc: bigint | null;

	/** Pacifica account equity, in USDC units. */
	perpEquityUsdc: bigint;
	/** Notional of the open short, for the leverage figure. */
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
		spot: bigint;
		perpEquity: bigint;
		idleAtAgent: bigint;
		inFlight: bigint;
	};
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
 */
export function value(inputs: ValuationInputs): Valuation {
	if (inputs.spotTokenBalance > 0n && inputs.spotSellQuoteUsdc === null) {
		throw new ValuationError(
			"The spot leg holds tokens but cannot be routed to a sell quote, so the position cannot be priced. Reporting the rest as the whole would understate NAV by the entire spot leg.",
		);
	}

	const spot = inputs.spotSellQuoteUsdc ?? 0n;
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
	};
}

/**
 * Leverage on the perp leg: notional over the margin backing it.
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
