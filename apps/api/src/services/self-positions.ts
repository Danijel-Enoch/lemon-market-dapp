import type { SelfPositionStatus } from "@lemon/db";
import { prisma } from "@lemon/db";
import { isAccountNotFound, type PacificaPosition } from "@lemon/pacifica";
import { erc20Abi } from "viem";
import { clientFor } from "../chain";
import { clients } from "../config";
import { getBasisMarket } from "./basis-markets";
import type { UserWalletSummary } from "./user-wallet";

/**
 * Self-managed positions, as they actually are right now.
 *
 * The table is a record of intent and history; the venues are the truth. So
 * every read here goes back to both of them — the ERC-20 balance in the user's
 * own wallet, and the open position on Pacifica — and reports what it finds
 * rather than what was written down. That ordering is the whole design.
 *
 * It matters more here than it would for a vault. A vault's agent is the only
 * thing that can move a vault's legs, so the database and the venue drift apart
 * only when something has broken. A self-managed position's spot leg sits in the
 * user's own wallet, where they may sell it on any exchange, at any time,
 * without telling us. Treating our row as authoritative would render a position
 * the user closed themselves an hour ago as comfortably hedged.
 *
 * Nothing here writes. Phase one shows positions and their health; opening,
 * closing and rebalancing arrive with the execution layer, and keeping the read
 * path free of writes means a page load can never mutate a position.
 */

/**
 * How far from flat a position may be before the hedge is worth complaining
 * about, as a fraction of spot notional.
 *
 * Deliberately not zero. The two legs are priced by different venues at
 * different instants, and lot sizes are coarse enough that an exactly equal
 * hedge is usually unrepresentable — a perp with a 0.001 lot size cannot match
 * an arbitrary token amount. Flagging that as a drift would mean every healthy
 * position permanently warning about itself.
 */
const DELTA_TOLERANCE = 0.01;

/**
 * One leg of a position, as the venue currently reports it.
 *
 * `size` is null rather than zero when the leg could not be read. The
 * difference is the whole point: a leg that is genuinely flat and a leg whose
 * venue is unreachable look identical in a number, and only one of them means
 * the user is unhedged.
 */
export interface LegState {
	/** Underlying units the venue says are there. Null when it could not be read. */
	size: number | null;
	/** USD value at the current mark. Null when size or price is unknown. */
	valueUsd: number | null;
	/** Why the leg could not be read, when it could not. */
	unavailable: string | null;
}

export interface SelfPositionView {
	id: string;
	ticker: string;
	chainId: number;
	status: SelfPositionStatus;
	statusReason: string | null;

	spot: LegState & {
		symbol: string;
		address: string;
		/** What the position paid for it, 6dp — the other half of the P&L. */
		costUsdc: string;
	};

	perp: LegState & {
		symbol: string;
		/** Average entry of the short, 6dp. */
		entryPrice: string;
		/** Where the venue would liquidate. Null at 1x, where there is no such price. */
		liquidationPrice: number | null;
		/** Unrealised P&L on the short leg alone, 6dp signed. */
		unrealisedPnlUsdc: string | null;
	};

	/**
	 * How far from delta-neutral the position actually is, right now.
	 *
	 * The single number this page exists to show. Positive means net long —
	 * more spot than short — and negative means net short. A basis position is
	 * supposed to sit at zero, and any distance from it is directional exposure
	 * the holder did not sign up for.
	 */
	hedge: {
		/** Net exposure in underlying units, signed. */
		netUnits: number | null;
		/** The same, in USD at the current mark. */
		netUsd: number | null;
		/** As a fraction of spot notional, so positions of different sizes compare. */
		netPercent: number | null;
		/** False when the legs are further apart than this position's tolerance. */
		balanced: boolean;
		/**
		 * What a reader should take from the above, in words.
		 *
		 * Composed here rather than in the browser because the interesting cases
		 * are conditional on data the browser does not have — an unread leg is
		 * not a small drift, and an equity market closed for the night is not a
		 * broken hedge.
		 */
		summary: string;
	};

	economics: {
		/** Margin committed to the short leg, 6dp. */
		marginUsdc: string;
		leverageBps: number;
		/** Funding collected so far, 6dp signed. The reason the trade exists. */
		fundingUsdc: string;
		/** Current short-side funding, percent per hour. Null when unknown. */
		fundingRatePercentPerHour: number | null;
		/** Annualised, on capital actually deployed. */
		netApyPercent: number | null;
		/** Total position value now, 6dp: spot + margin. */
		valueUsdc: string | null;
		/** Unrealised across both legs, 6dp signed. */
		unrealisedPnlUsdc: string | null;
		/** Written at close and fixed thereafter. Null while open. */
		realisedPnlUsdc: string | null;
	};

	openedAt: string | null;
	closedAt: string | null;
	updatedAt: string;
}

/**
 * Every position a user has, with both legs re-read from their venues.
 *
 * Pacifica is asked once for the whole account rather than once per position:
 * the account is cross-margined, so one call already contains every position's
 * short leg, and N calls would be N chances to be rate-limited into rendering a
 * healthy position as unreadable.
 */
export async function listSelfPositions(params: {
	userId: string;
	wallet: UserWalletSummary;
	/** The connected wallet, which is where the spot legs live. */
	ownerAddress: string;
	/** Closed positions are history and are excluded unless asked for. */
	includeClosed?: boolean;
}): Promise<SelfPositionView[]> {
	const rows = await prisma.selfPosition.findMany({
		where: {
			userId: params.userId,
			...(params.includeClosed ? {} : { status: { not: "CLOSED" } }),
		},
		orderBy: [{ closedAt: "asc" }, { createdAt: "desc" }],
	});

	if (rows.length === 0) return [];

	const perpLegs = await readPacificaPositions(params.wallet.solanaAddress);

	return await Promise.all(
		rows.map((row) =>
			buildView({
				row,
				ownerAddress: params.ownerAddress,
				perp: perpLegs.get(row.perpSymbol.toUpperCase()) ?? null,
				perpUnavailable: perpLegs.unavailable,
			}),
		),
	);
}

export async function getSelfPosition(params: {
	userId: string;
	wallet: UserWalletSummary;
	ownerAddress: string;
	id: string;
}): Promise<SelfPositionView | null> {
	const row = await prisma.selfPosition.findFirst({
		// Scoped by user as well as id: an id is a cuid rather than a secret, and
		// a position is the one object here that names what somebody owns.
		where: { id: params.id, userId: params.userId },
	});
	if (!row) return null;

	const perpLegs = await readPacificaPositions(params.wallet.solanaAddress);

	return await buildView({
		row,
		ownerAddress: params.ownerAddress,
		perp: perpLegs.get(row.perpSymbol.toUpperCase()) ?? null,
		perpUnavailable: perpLegs.unavailable,
	});
}

/** The append-only history of one position. */
export async function listPositionEvents(params: { userId: string; positionId: string }) {
	const position = await prisma.selfPosition.findFirst({
		where: { id: params.positionId, userId: params.userId },
		select: { id: true },
	});
	if (!position) return null;

	const events = await prisma.selfPositionEvent.findMany({
		where: { positionId: position.id },
		orderBy: { createdAt: "desc" },
	});

	return events.map((event) => ({
		id: event.id,
		kind: event.kind,
		venue: event.venue,
		chainId: event.chainId,
		txRef: event.txRef,
		amount: event.amount,
		valueUsdc: event.valueUsdc,
		detail: event.detail,
		at: event.createdAt.toISOString(),
	}));
}

/**
 * Every open short on the account, keyed by symbol.
 *
 * The `unavailable` field rides along with the map rather than throwing,
 * because one unreachable venue must not blank a page that can still show the
 * spot legs honestly. A position with an unreadable perp leg renders as exactly
 * that — not as unhedged, which would be a claim we cannot support.
 */
async function readPacificaPositions(
	account: string,
): Promise<Map<string, PacificaPosition> & { unavailable: string | null }> {
	const map = new Map<string, PacificaPosition>() as Map<string, PacificaPosition> & {
		unavailable: string | null;
	};
	map.unavailable = null;

	try {
		for (const position of await clients.pacifica.positions(account)) {
			map.set(position.symbol.toUpperCase(), position);
		}
	} catch (error) {
		if (isAccountNotFound(error)) {
			// Not an error. An account exists from its first deposit, so "not
			// found" is the ordinary state of a wallet that has never funded one —
			// and it genuinely means no open shorts.
			return map;
		}
		map.unavailable =
			error instanceof Error
				? `Pacifica could not be reached: ${error.message}`
				: "Pacifica could not be reached.";
	}

	return map;
}

/**
 * The ERC-20 balance backing a position's spot leg.
 *
 * Read from the user's own wallet, on the position's own chain. The balance is
 * *not* the position size and is not treated as it: the same wallet may hold the
 * same token bought somewhere else entirely, and hedging against that would
 * short capital the user never asked to hedge. What the balance establishes is
 * an upper bound — a position claiming more spot than the wallet holds has had
 * its leg sold from under it, which is the one case worth acting on.
 */
async function readSpotBalance(params: {
	chainId: number;
	token: string;
	owner: string;
}): Promise<bigint | null> {
	try {
		const client = clientFor(params.chainId);
		return await client.readContract({
			address: params.token as `0x${string}`,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [params.owner as `0x${string}`],
		});
	} catch {
		return null;
	}
}

async function buildView(params: {
	row: {
		id: string;
		ticker: string;
		chainId: number;
		status: SelfPositionStatus;
		statusReason: string | null;
		spotTokenAddress: string;
		spotTokenSymbol: string;
		spotTokenDecimals: number;
		spotAmount: string;
		spotCostUsdc: string;
		perpSymbol: string;
		perpSize: string;
		perpEntryPrice: string;
		leverageBps: number;
		marginUsdc: string;
		rebalanceDriftBps: number;
		fundingUsdc: string;
		realisedPnlUsdc: string | null;
		openedAt: Date | null;
		closedAt: Date | null;
		updatedAt: Date;
	};
	ownerAddress: string;
	perp: PacificaPosition | null;
	perpUnavailable: string | null;
}): Promise<SelfPositionView> {
	const { row } = params;

	const [market, walletBalance] = await Promise.all([
		getBasisMarket(row.ticker, row.chainId),
		readSpotBalance({
			chainId: row.chainId,
			token: row.spotTokenAddress,
			owner: params.ownerAddress,
		}),
	]);

	const markPrice = market?.perp.markPrice ?? null;
	const spotPrice = market?.spot.priceUsd ?? markPrice;

	// The position's own recorded size, capped by what the wallet actually holds.
	// Capping rather than trusting either one alone is what catches a spot leg
	// sold outside the app: the row still claims it, the chain says otherwise,
	// and the chain wins.
	const recordedSpot = Number(row.spotAmount) / 10 ** row.spotTokenDecimals;
	const heldSpot =
		walletBalance === null ? null : Number(walletBalance) / 10 ** row.spotTokenDecimals;
	const spotSize = heldSpot === null ? recordedSpot : Math.min(recordedSpot, heldSpot);

	const perpSize = params.perp
		? Math.abs(Number(params.perp.amount))
		: params.perpUnavailable
			? null
			: 0;

	const spotValue = spotPrice === null ? null : spotSize * spotPrice;
	const perpValue = perpSize === null || markPrice === null ? null : perpSize * markPrice;

	const hedge = assessHedge({
		spotSize,
		perpSize,
		markPrice,
		spotValue,
		toleranceBps: row.rebalanceDriftBps,
		perpUnavailable: params.perpUnavailable,
		marketOpen: market?.perp.isOpen ?? null,
		assetClass: market?.assetClass ?? null,
	});

	const unrealised = computeUnrealised({
		spotValue,
		spotCostUsdc: row.spotCostUsdc,
		perp: params.perp,
		markPrice,
	});

	return {
		id: row.id,
		ticker: row.ticker,
		chainId: row.chainId,
		status: row.status,
		statusReason: row.statusReason,

		spot: {
			symbol: row.spotTokenSymbol,
			address: row.spotTokenAddress,
			costUsdc: row.spotCostUsdc,
			size: spotSize,
			valueUsd: spotValue,
			unavailable:
				walletBalance === null
					? `The spot balance on chain ${row.chainId} could not be read, so this leg is shown from our own records.`
					: heldSpot !== null && heldSpot + 1e-12 < recordedSpot
						? `This wallet holds ${heldSpot} ${row.spotTokenSymbol} but the position expects ${recordedSpot}. Some of the spot leg was moved or sold outside the app.`
						: null,
		},

		perp: {
			symbol: row.perpSymbol,
			entryPrice: row.perpEntryPrice,
			size: perpSize,
			valueUsd: perpValue,
			liquidationPrice: estimateLiquidationPrice({
				perp: params.perp,
				leverageBps: row.leverageBps,
			}),
			unrealisedPnlUsdc: shortLegPnl({ perp: params.perp, markPrice }),
			unavailable: params.perpUnavailable,
		},

		hedge,

		economics: {
			marginUsdc: row.marginUsdc,
			leverageBps: row.leverageBps,
			fundingUsdc: row.fundingUsdc,
			fundingRatePercentPerHour: market?.economics.fundingShortPercentPerHour ?? null,
			netApyPercent: market?.economics.netApyPercent ?? null,
			valueUsdc: spotValue === null ? null : toUsdc(spotValue + Number(row.marginUsdc) / 1e6),
			unrealisedPnlUsdc: unrealised,
			realisedPnlUsdc: row.realisedPnlUsdc,
		},

		openedAt: row.openedAt?.toISOString() ?? null,
		closedAt: row.closedAt?.toISOString() ?? null,
		updatedAt: row.updatedAt.toISOString(),
	};
}

/**
 * Whether the position is actually hedged, and what to say about it.
 *
 * The wording is as much the output as the number. "Net long 0.3 BTC" is a fact
 * a reader has to interpret; "you are long $31,400 of BTC that nothing is
 * hedging" is the same fact with the consequence attached, and the consequence
 * is the part that makes someone act.
 */
function assessHedge(params: {
	spotSize: number;
	perpSize: number | null;
	markPrice: number | null;
	spotValue: number | null;
	toleranceBps: number;
	perpUnavailable: string | null;
	marketOpen: boolean | null;
	assetClass: "equity" | "crypto" | null;
}): SelfPositionView["hedge"] {
	if (params.perpSize === null) {
		return {
			netUnits: null,
			netUsd: null,
			netPercent: null,
			// Not "unbalanced". We do not know, and claiming a hedge is broken when
			// the venue is merely unreachable would send someone to close a
			// perfectly good position.
			balanced: true,
			summary:
				params.perpUnavailable ??
				"The short leg could not be read, so this position's hedge cannot be confirmed right now.",
		};
	}

	const netUnits = params.spotSize - params.perpSize;
	const netUsd = params.markPrice === null ? null : netUnits * params.markPrice;
	const notional = params.spotValue ?? null;
	const netPercent =
		netUsd === null || notional === null || notional === 0 ? null : netUsd / notional;

	const tolerance = Math.max(params.toleranceBps / 10_000, DELTA_TOLERANCE);
	const balanced = netPercent === null ? true : Math.abs(netPercent) <= tolerance;

	if (params.spotSize === 0 && params.perpSize === 0) {
		return {
			netUnits: 0,
			netUsd: 0,
			netPercent: 0,
			balanced: true,
			summary: "Both legs are flat.",
		};
	}

	if (params.spotSize === 0) {
		return {
			netUnits,
			netUsd,
			netPercent,
			balanced: false,
			summary: `Short only. There is no spot leg against this short, so you are directionally short${money(netUsd)} — a rising price loses money here.`,
		};
	}

	if (params.perpSize === 0) {
		return {
			netUnits,
			netUsd,
			netPercent,
			balanced: false,
			summary: `Spot only. Nothing is hedging this holding, so you are directionally long${money(netUsd)} — this is a price bet, not a basis position.`,
		};
	}

	if (balanced) {
		// An equity basis is legitimately unhedgeable outside exchange hours, and
		// saying so is the difference between a user waiting and a user panicking.
		const closed =
			params.assetClass === "equity" && params.marketOpen === false
				? " The perp is closed until the next session, so this cannot be adjusted right now."
				: "";
		return {
			netUnits,
			netUsd,
			netPercent,
			balanced: true,
			summary: `Hedged. The two legs are within ${(tolerance * 100).toFixed(1)}% of each other, so price moves cancel out and what is left is funding.${closed}`,
		};
	}

	const direction = netUnits > 0 ? "long" : "short";
	return {
		netUnits,
		netUsd,
		netPercent,
		balanced: false,
		summary: `Drifted. The legs are ${netPercent === null ? "" : `${(Math.abs(netPercent) * 100).toFixed(1)}% `}apart, leaving you net ${direction}${money(netUsd)}. Rebalancing brings them back level; leaving it means part of the position is a price bet.`,
	};
}

/** " of $1,234" or nothing, so a sentence reads properly when the price is unknown. */
function money(value: number | null): string {
	if (value === null) return "";
	return ` by about $${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Where a short would be liquidated, as an estimate and labelled one.
 *
 * Pacifica does not return a liquidation price on a position, so this is
 * reconstructed from the position's own margin: a short loses `(price - entry) *
 * size`, and it runs out of margin when that reaches what is backing it. The
 * real trigger is earlier, because the venue liquidates at a maintenance margin
 * rather than at zero equity, so this number is optimistic by design and the UI
 * says so.
 *
 * Null at 1x, and that is not a missing value — a fully collateralised short
 * has no liquidation price at all. Rendering one would invent a risk the
 * position does not carry, which is exactly the property someone chose 1x for.
 */
function estimateLiquidationPrice(params: {
	perp: PacificaPosition | null;
	leverageBps: number;
}): number | null {
	if (!params.perp) return null;
	if (params.leverageBps <= 10_000) return null;

	const size = Math.abs(Number(params.perp.amount));
	const margin = Number(params.perp.margin);
	const entry = Number(params.perp.entry_price);

	if (!size || !Number.isFinite(margin) || !Number.isFinite(entry)) return null;

	// A short is liquidated as the price rises, so the margin is added to entry.
	return entry + margin / size;
}

/**
 * Unrealised P&L on the short leg alone, 6dp signed.
 *
 * A short gains as the price falls, so the sign is `(entry - mark)`. Computed
 * against Pacifica's own entry price rather than the one recorded at open,
 * because a position that was added to has an average entry only the venue
 * knows — and a figure that disagrees with the venue is worse than no figure on
 * the screen where someone decides whether to close.
 */
function shortLegPnl(params: {
	perp: PacificaPosition | null;
	markPrice: number | null;
}): string | null {
	if (!params.perp || params.markPrice === null) return null;

	const size = Math.abs(Number(params.perp.amount));
	const entry = Number(params.perp.entry_price);
	if (!Number.isFinite(size) || !Number.isFinite(entry)) return null;

	return toUsdc((entry - params.markPrice) * size);
}

/**
 * Unrealised P&L across both legs, 6dp.
 *
 * The two halves come from different places and neither is optional. The spot
 * leg's is ours to compute, because we recorded what it cost. The perp leg's is
 * Pacifica's, because entry price and mark are both theirs and recomputing them
 * from a stale entry would report a number the venue disagrees with — on the
 * screen where a user decides whether to close.
 */
function computeUnrealised(params: {
	spotValue: number | null;
	spotCostUsdc: string;
	perp: PacificaPosition | null;
	markPrice: number | null;
}): string | null {
	if (params.spotValue === null) return null;

	const spotPnl = params.spotValue - Number(params.spotCostUsdc) / 1e6;

	// Zero rather than null when the short leg is absent: a spot-only position
	// has a perfectly real P&L, and refusing to show it because one leg is
	// missing hides the number from the person most in need of seeing it.
	const perpPnl = params.perp
		? Number(shortLegPnl({ perp: params.perp, markPrice: params.markPrice }) ?? 0) / 1e6
		: 0;

	if (!Number.isFinite(spotPnl) || !Number.isFinite(perpPnl)) return null;
	return toUsdc(spotPnl + perpPnl);
}

/** A decimal USD figure as a 6dp base-unit string, which is how amounts travel. */
function toUsdc(value: number): string {
	return String(BigInt(Math.round(value * 1e6)));
}
