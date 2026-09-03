import { formatUsd, toBaseUnits, USDC_ADDRESS, USDC_DECIMALS } from "@lemon/core";
import type { BasisPosition, BasisStatus, User } from "@lemon/db";
import { prisma } from "@lemon/db";
import {
	ALLOWED_TRANSITIONS,
	type BasisEvent,
	type BasisPlan,
	defaultCosts,
	nextStatus,
	planBasis,
	repairActionsFor,
} from "@lemon/registry";
import { clients, config } from "../config";
import { getBasisMarket } from "./basis-markets";
import { builderCodeFor } from "./builder";
import { getMarket } from "./markets";
import { tradingIdentity } from "./pacifica-account";

/**
 * Basis position lifecycle.
 *
 * A position spans two independent systems — a KyberSwap swap on-chain and a
 * Pacifica order off it — with no shared transaction. Either leg can
 * land while the other fails, and when that happens the user is holding a
 * one-sided, directional position they did not ask for.
 *
 * Every state change is therefore persisted before the next leg is attempted,
 * and a half-open position lands in ORPHANED (recoverable) rather than FAILED
 * (terminal). The distinction matters: FAILED implies nothing happened, and
 * treating an orphan as failed would silently abandon real money on-chain.
 */

export class BasisTransitionError extends Error {
	constructor(from: BasisStatus, to: BasisStatus) {
		super(`Illegal position transition ${from} -> ${to}`);
		this.name = "BasisTransitionError";
	}
}

/**
 * A leg could not be executed.
 *
 * Distinct from `BasisTransitionError`, which means the state machine was asked
 * for something impossible. This one means the machine was right and the venue
 * refused — a different problem, with a different owner, and worth telling
 * apart in a log.
 */
export class BasisLegError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BasisLegError";
	}
}

function assertTransition(from: BasisStatus, to: BasisStatus) {
	if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new BasisTransitionError(from, to);
}

/**
 * Apply an event through the pure state machine, then persist.
 *
 * The transition rules live in `@lemon/registry/basis-machine` so they can be
 * tested without a database — particularly the orphan branch, where getting the
 * rule wrong would mark a position closed while funds sit unhedged on-chain.
 */
async function applyEvent(id: string, event: BasisEvent, data: Record<string, unknown> = {}) {
	const current = await prisma.basisPosition.findUnique({ where: { id } });
	if (!current) return null;

	const target = nextStatus(current.status, event);
	if (!target) throw new BasisTransitionError(current.status, current.status);

	return prisma.basisPosition.update({ where: { id }, data: { status: target, ...data } });
}

export interface PlanRequest {
	/** Market id, either leg's symbol, or the underlying ticker. */
	symbol: string;
	notionalUsd: number;
	perpLeverage: number;
}

export interface PlanResponse {
	marketId: string;
	symbol: string;
	tokenSymbol: string;
	marketSymbol: string;
	plan: BasisPlan;
	buyable: boolean;
	blockers: string[];
}

/**
 * Price a position without committing to it.
 *
 * Quotes both legs for real — a live KyberSwap route at the requested size for
 * the spot side, live funding for the perp side — because a plan built from
 * stale or assumed numbers is exactly how a "delta-neutral yield" position
 * turns out to be neither.
 *
 * Deliberately re-quotes rather than reusing the board's figures. The board is
 * priced at a fixed reference notional so its rows stay comparable; slippage is
 * not linear in size, so a $200k entry into a thin pool can cost several times
 * what the $10k row implied. Ranking off one number and committing off another
 * is the point.
 */
export async function buildPlan(request: PlanRequest): Promise<PlanResponse | null> {
	const basis = await getBasisMarket(request.symbol);
	if (!basis) return null;

	const market = await getMarket(basis.perp.symbol);
	if (!market) return null;

	const blockers = [...basis.blockers];

	// Quote the real entry size so price impact is measured, not extrapolated.
	const quote = await clients.kyber.getRoute({
		tokenIn: USDC_ADDRESS,
		tokenOut: basis.spot.address,
		amountIn: toBaseUnits(request.notionalUsd, USDC_DECIMALS).toString(),
	});
	if (!quote.ok) {
		blockers.push(
			`${basis.spot.symbol} has no buy route at ${formatUsd(request.notionalUsd)}, so the spot leg cannot be opened.`,
		);
	}

	// Pacifica reports one hourly funding rate; the shared market splits it by
	// side. A market with no rate at all is the "unavailable" case.
	const hasFunding =
		Number.isFinite(market.fundingLongPercentPerHour) &&
		Number.isFinite(market.fundingShortPercentPerHour);
	if (!hasFunding) blockers.push("Funding rates are unavailable for this market.");

	const impact = quote.ok ? quote.quote.priceImpactPercent : 0;
	const plan = planBasis({
		notionalUsd: request.notionalUsd,
		perpLeverage: request.perpLeverage,
		funding: hasFunding
			? { long: market.fundingLongPercentPerHour, short: market.fundingShortPercentPerHour }
			: { long: 0, short: 0 },
		costs: defaultCosts({
			// Pacifica publishes no per-market fee — it charges from the
			// account's fee level — so the venue's own spread field is the only
			// per-market component to add on top of the flat taker rate.
			spreadPercent: market.spreadPercent,
			spotBuyImpactPercent: impact,
			// Exit impact is unknowable ahead of time; the entry measurement is
			// the best available estimate and is labelled as such in the UI.
			spotSellImpactPercent: impact,
			gasUsd: quote.ok ? quote.quote.gasUsd * 2 : 0,
		}),
		market,
	});

	return {
		marketId: basis.id,
		symbol: basis.spot.symbol,
		tokenSymbol: basis.spot.symbol,
		marketSymbol: basis.perp.symbol,
		plan,
		buyable: quote.ok,
		blockers,
	};
}

export async function createPosition(params: {
	userAddress: string;
	symbol: string;
	notionalUsd: number;
	perpLeverage: number;
}): Promise<BasisPosition | null> {
	const planned = await buildPlan({
		symbol: params.symbol,
		notionalUsd: params.notionalUsd,
		perpLeverage: params.perpLeverage,
	});
	if (!planned) return null;

	return prisma.basisPosition.create({
		data: {
			userAddress: params.userAddress.toLowerCase(),
			tokenSymbol: planned.tokenSymbol,
			perpSymbol: planned.marketSymbol,
			status: "VALIDATING",
			notionalUsd: planned.plan.notionalUsd,
			perpCollateralUsd: planned.plan.perpCollateralUsd,
			perpLeverage: planned.plan.perpLeverage,
			entryFundingRatePct: planned.plan.netFundingPerHourPercent,
			entryNetApyPct: planned.plan.netApyPercent,
		},
	});
}

export function recordEvent(params: {
	positionId: string;
	leg: "SPOT" | "PERP";
	action: string;
	status: string;
	txHash?: string;
	trackingId?: string;
	error?: string;
	payload?: unknown;
}) {
	return prisma.basisLegEvent.create({
		data: {
			positionId: params.positionId,
			leg: params.leg,
			action: params.action,
			status: params.status,
			txHash: params.txHash,
			trackingId: params.trackingId,
			error: params.error,
			payload: (params.payload ?? undefined) as never,
		},
	});
}

async function transition(id: string, to: BasisStatus, data: Record<string, unknown> = {}) {
	const current = await prisma.basisPosition.findUnique({ where: { id } });
	if (!current) return null;
	assertTransition(current.status, to);
	return prisma.basisPosition.update({
		where: { id },
		data: { status: to, ...data },
	});
}

/** Spot leg filled. From here the position is directionally exposed until the short lands. */
export async function markSpotFilled(
	id: string,
	params: { txHash: string; shares: number; spotCostUsd: number },
) {
	await recordEvent({
		positionId: id,
		leg: "SPOT",
		action: "buy",
		status: "confirmed",
		txHash: params.txHash,
	});
	return transition(id, "SPOT_FILLED", {
		spotBuyTxHash: params.txHash,
		shares: params.shares,
		spotCostUsd: params.spotCostUsd,
	});
}

/**
 * Open the short leg on Pacifica.
 *
 * The order is placed here rather than by the browser. On the reference design this leg was
 * a wallet signature and an on-chain confirmation, which is what made a
 * half-open position so easy to end up with: the spot buy landed, the user closed
 * the tab, and the hedge never happened. Signing server-side with the agent key
 * collapses that window to a single request.
 *
 * The size is derived from the position's notional and the live mark, then
 * rounded down onto the lot grid — rounding up could exceed the collateral the
 * plan was built from.
 */
export async function openPerpLeg(id: string, user: User) {
	const position = await prisma.basisPosition.findUnique({ where: { id } });
	if (!position) return null;

	const market = await getMarket(position.perpSymbol);
	if (!market) throw new BasisLegError(`No perp market for ${position.perpSymbol}.`);

	const price = market.pacifica.markPrice;
	if (!price || price <= 0) {
		throw new BasisLegError(`No live price for ${position.perpSymbol}; refusing to hedge.`);
	}

	const lot = market.pacifica.lotSize;
	const size =
		lot > 0 ? Math.floor(position.notionalUsd / price / lot) * lot : position.notionalUsd / price;
	if (size <= 0) {
		throw new BasisLegError(
			`${formatUsd(position.notionalUsd)} is below one lot of ${position.perpSymbol}.`,
		);
	}

	const identity = tradingIdentity(user);

	try {
		await clients.pacifica.updateLeverage(identity.sign, {
			account: identity.account,
			agentWallet: identity.agentWallet,
			symbol: market.pacifica.pacificaSymbol,
			leverage: position.perpLeverage,
		});

		const receipt = await clients.pacifica.createMarketOrder(identity.sign, {
			account: identity.account,
			agentWallet: identity.agentWallet,
			symbol: market.pacifica.pacificaSymbol,
			// Short: the hedge against a long spot holding.
			side: "ask",
			amount: size.toFixed(decimalsFor(lot)),
			slippagePercent: "1",
			builderCode: builderCodeFor(user, config.fees.pacificaBuilder),
		});

		await recordEvent({
			positionId: id,
			leg: "PERP",
			action: "open",
			status: "confirmed",
			trackingId: String(receipt.order_id),
		});

		return transition(id, "OPEN", { openedAt: new Date(), failureReason: null });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Short leg failed";
		await markLegFailed(id, { leg: "PERP", error: message });
		throw new BasisLegError(message);
	}
}

/**
 * Close the short leg.
 *
 * The size comes from the live Pacifica position rather than from the stored
 * plan: partial fills and funding drift mean the two can disagree, and closing
 * the stored size would leave a remainder short.
 */
export async function closePerpLeg(id: string, user: User) {
	const position = await prisma.basisPosition.findUnique({ where: { id } });
	if (!position) return null;

	const market = await getMarket(position.perpSymbol);
	if (!market) throw new BasisLegError(`No perp market for ${position.perpSymbol}.`);

	const identity = tradingIdentity(user);
	const open = await clients.pacifica.positions(identity.account);
	const live = open.find((candidate) => candidate.symbol === market.pacifica.pacificaSymbol);

	if (!live) {
		// Nothing to close. Recording it as closed is right: the hedge is gone
		// either way, and leaving the position UNWINDING would strand it.
		await recordEvent({ positionId: id, leg: "PERP", action: "close", status: "already_closed" });
		return markClosed(id, {});
	}

	try {
		const receipt = await clients.pacifica.createMarketOrder(identity.sign, {
			account: identity.account,
			agentWallet: identity.agentWallet,
			symbol: market.pacifica.pacificaSymbol,
			side: live.side === "bid" ? "ask" : "bid",
			amount: live.amount,
			slippagePercent: "1",
			reduceOnly: true,
			builderCode: builderCodeFor(user, config.fees.pacificaBuilder),
		});

		return markClosed(id, { trackingId: String(receipt.order_id) });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Closing the short failed";
		await markLegFailed(id, { leg: "PERP", error: message });
		throw new BasisLegError(message);
	}
}

/** Decimal places implied by a lot size, so a rounded size formats exactly. */
function decimalsFor(increment: number): number {
	if (!increment || increment >= 1) return 0;
	return Math.min(8, Math.ceil(-Math.log10(increment)));
}

/**
 * A leg failed.
 *
 * If the counterpart leg already landed, the position becomes ORPHANED and
 * stays actionable — the user is holding real exposure and must be able to
 * repair or unwind it. Only a failure with nothing on-chain is terminal.
 */
export async function markLegFailed(id: string, params: { leg: "SPOT" | "PERP"; error: string }) {
	const current = await prisma.basisPosition.findUnique({ where: { id } });
	if (!current) return null;

	await recordEvent({
		positionId: id,
		leg: params.leg,
		action: "failed",
		status: "error",
		error: params.error,
	});

	// The machine decides FAILED vs ORPHANED: only a failure with nothing
	// on-chain is terminal.
	return applyEvent(
		id,
		{ type: "leg_failed", leg: params.leg },
		{
			failureReason: params.error,
		},
	);
}

export async function startUnwind(id: string) {
	return transition(id, "UNWINDING");
}

export async function markSpotClosed(id: string, params: { txHash: string; proceedsUsd: number }) {
	await recordEvent({
		positionId: id,
		leg: "SPOT",
		action: "sell",
		status: "confirmed",
		txHash: params.txHash,
	});
	return transition(id, "SPOT_CLOSED", { spotSellTxHash: params.txHash });
}

export async function markClosed(
	id: string,
	params: { txHash?: string; trackingId?: string; realizedPnlUsd?: number },
) {
	await recordEvent({
		positionId: id,
		leg: "PERP",
		action: "close",
		status: "confirmed",
		txHash: params.txHash,
		trackingId: params.trackingId,
	});
	return transition(id, "CLOSED", {
		perpCloseTxHash: params.txHash,
		realizedPnlUsd: params.realizedPnlUsd,
		closedAt: new Date(),
	});
}

/**
 * What an orphaned position needs in order to become consistent again.
 *
 * Returned to the UI so the repair prompt can name the actual exposure rather
 * than showing a generic error — "you hold 3.2 NVDAc unhedged" is actionable in
 * a way that "something went wrong" is not.
 */
export interface RepairOption {
	action: "retry_perp" | "unwind_spot" | "close_perp";
	label: string;
	description: string;
}

export function repairOptions(position: BasisPosition): RepairOption[] {
	const actions = repairActionsFor({
		spotOpened: Boolean(position.spotBuyTxHash),
		spotClosed: Boolean(position.spotSellTxHash),
		perpOpened: Boolean(position.perpOpenTxHash),
		perpClosed: Boolean(position.perpCloseTxHash),
	});
	const hasSpot = actions.includes("retry_perp");
	const hasPerp = actions.includes("close_perp");

	if (hasSpot) {
		return [
			{
				action: "retry_perp",
				label: "Open the short leg",
				description: `Short ${position.perpSymbol} to hedge the ${position.shares ?? 0} ${position.tokenSymbol} you are holding.`,
			},
			{
				action: "unwind_spot",
				label: "Sell the spot leg",
				description: `Sell the ${position.tokenSymbol} back to USDC and close this position out.`,
			},
		];
	}

	if (hasPerp) {
		return [
			{
				action: "close_perp",
				label: "Close the short leg",
				description: `Close the ${position.perpSymbol} short — there is no spot position hedging it.`,
			},
		];
	}

	return [];
}

export function listPositions(userAddress: string) {
	return prisma.basisPosition.findMany({
		where: { userAddress: userAddress.toLowerCase() },
		orderBy: { createdAt: "desc" },
		include: { events: { orderBy: { createdAt: "asc" } } },
	});
}

export function getPosition(id: string) {
	return prisma.basisPosition.findUnique({
		where: { id },
		include: { events: { orderBy: { createdAt: "asc" } } },
	});
}

/** Positions needing user attention, surfaced prominently rather than buried. */
export function listOrphaned(userAddress: string) {
	return prisma.basisPosition.findMany({
		where: { userAddress: userAddress.toLowerCase(), status: "ORPHANED" },
		orderBy: { updatedAt: "desc" },
	});
}
