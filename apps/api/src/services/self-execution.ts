import { requireChainInfo, usdcFor } from "@lemon/core";
import { prisma } from "@lemon/db";
import {
	type Address,
	decodeEventLog,
	encodeFunctionData,
	erc20Abi,
	type Hex,
	maxUint256,
} from "viem";
import { clientFor } from "../chain";
import { clients } from "../config";
import { getBasisMarket } from "./basis-markets";
import { closeShort, openShort, readShort, setLeverage } from "./self-perp";
import type { UserWalletSummary } from "./user-wallet";

/**
 * Opening, closing and rebalancing a self-managed position.
 *
 * Every flow here is shaped by one constraint: **the spot leg can only be moved
 * by a transaction the user's own wallet signs, and the perp leg can only be
 * moved by this server.** So nothing is a single call. An open is prepare →
 * user signs → hedge, across two parties, with the browser free to close in
 * between, and `SelfAction` is what carries the state across that gap.
 *
 * ## The ordering rule, which is the important part
 *
 * **The user's leg always goes first, and the server's follows immediately.**
 *
 * That is not arbitrary and it is not symmetric. Consider the alternative for an
 * open: short the perp first, then ask the user to buy spot. If they close the
 * tab at that point the position sits *short only* — a directional bet against
 * the market — for as long as they stay away, which could be forever. Doing it
 * the other way round, the exposed window is the time between the spot
 * transaction confirming and the server's hedge landing, which is seconds and
 * is ours to shorten.
 *
 * The same argument gives the same answer for a close, and it is worth stating
 * because the instinct is to reverse it. Selling spot first leaves a short-only
 * gap of seconds. Closing the perp first leaves a *long-only* position for as
 * long as the user takes to sign the sale — and a user closing a position is,
 * by definition, someone who may well walk away once they believe it is done.
 *
 * ## Rebalancing needs no signature at all
 *
 * A basis position drifts when its two legs stop matching, and the fix is
 * always to resize the *perp* — which is the leg this server can move alone.
 * Asking the user to adjust their spot holding instead would be a worse trade
 * (two fills rather than one) and would make the routine maintenance of a
 * position depend on a human being awake.
 */

export class ExecutionError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "ExecutionError";
	}
}

/** Slippage for both legs, as a percent. */
const DEFAULT_SLIPPAGE_PERCENT = 0.5;

/**
 * How far the legs may sit apart before a rebalance is worth doing, in basis
 * points of spot notional.
 *
 * Matches `SelfPosition.rebalanceDriftBps`'s default. Rebalancing costs two
 * fills' worth of spread, so a threshold near zero spends more on corrections
 * than the drift was ever worth.
 */
const DEFAULT_DRIFT_BPS = 500;

/** An unsigned transaction for the user's wallet, with the reason it exists. */
export interface UnsignedStep {
	label: string;
	to: string;
	data: string;
	value: string;
	chainId: number;
}

export interface PreparedAction {
	actionId: string;
	kind: string;
	step: string;
	/** What the browser must get signed before calling back. */
	steps: UnsignedStep[];
	/** What the server will do once it has, so the UI can say so up front. */
	nextDescription: string;
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/**
 * Stage an open: check it is possible, then hand back the spot transactions.
 *
 * Nothing is created on Pacifica here and no position row reaches a funded
 * state. What exists afterwards is a `DRAFT` position and an `AWAITING_USER`
 * action holding the calldata — so a user who never signs leaves a draft and no
 * exposure, which is exactly what should happen.
 *
 * The margin check happens *before* the swap is prepared rather than after it
 * is signed. Discovering a shortfall afterwards means holding spot with no
 * margin to hedge it against, which is the single worst state this flow can
 * produce and the one every ordering decision above is arranged to avoid.
 */
export async function prepareOpen(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	ticker: string;
	chainId: number;
	/** USD of notional to buy. */
	notionalUsd: number;
	leverage: number;
}): Promise<PreparedAction> {
	const chain = requireChainInfo(params.chainId);
	const market = await getBasisMarket(params.ticker, chain.id);

	if (!market) {
		throw new ExecutionError(`No basis market called "${params.ticker}".`, 404);
	}
	if (market.blockers.length > 0) {
		throw new ExecutionError(`${market.ticker} cannot be entered right now: ${market.blockers[0]}`);
	}
	if (params.notionalUsd < market.perp.minPositionUsdc) {
		throw new ExecutionError(
			`Pacifica's minimum position in ${market.ticker} is $${market.perp.minPositionUsdc}; ${params.notionalUsd} would be rejected, leaving the spot leg unhedged.`,
		);
	}
	if (params.leverage < 1 || params.leverage > market.perp.maxLeverage) {
		throw new ExecutionError(
			`${market.ticker} allows between 1x and ${market.perp.maxLeverage}x on Pacifica.`,
		);
	}

	// The margin has to be on Pacifica already. Bridging is minutes and a
	// separate, explicitly-started thing — starting it implicitly here would
	// leave the user staring at a wallet prompt that cannot be satisfied yet.
	const requiredMargin = params.notionalUsd / params.leverage;
	const account = await clients.pacifica.accountInfo(params.wallet.solanaAddress).catch(() => null);
	const available = account ? Number(account.available_to_spend) : 0;

	if (available < requiredMargin) {
		throw new ExecutionError(
			`This position needs $${requiredMargin.toFixed(2)} of margin on Pacifica and $${available.toFixed(2)} is available. Bridge USDC to your margin wallet first — it takes a few minutes, and the spot leg should not be bought until it has landed.`,
		);
	}

	const usdc = usdcFor(chain.id);
	const amountIn = BigInt(Math.round(params.notionalUsd * 1e6));

	const swap = await buildSpotSwap({
		chainId: chain.id,
		tokenIn: usdc,
		tokenOut: market.spot.address as Address,
		amountIn,
		owner: params.owner as Address,
	});

	const position = await prisma.selfPosition.create({
		data: {
			userId: params.userId,
			walletId: await walletIdFor(params.userId),
			ticker: market.ticker,
			chainId: chain.id,
			status: "DRAFT",
			spotTokenAddress: market.spot.address,
			spotTokenSymbol: market.spot.symbol,
			spotTokenDecimals: market.spot.decimals,
			perpSymbol: market.perp.pacificaSymbol,
			leverageBps: Math.round(params.leverage * 10_000),
			marginUsdc: String(BigInt(Math.round(requiredMargin * 1e6))),
			rebalanceDriftBps: DEFAULT_DRIFT_BPS,
		},
	});

	const action = await startAction({
		userId: params.userId,
		positionId: position.id,
		kind: "OPEN",
		step: "spot",
		status: "AWAITING_USER",
		chainId: chain.id,
		payload: JSON.stringify({
			notionalUsd: params.notionalUsd,
			leverage: params.leverage,
			expectedOut: swap.amountOut,
		}),
	});

	return {
		actionId: action.id,
		kind: "OPEN",
		step: "spot",
		steps: swap.steps,
		nextDescription: `Once the buy confirms, ${market.ticker} is shorted on Pacifica at the size that actually filled — not the size quoted — so the hedge matches what you really hold.`,
	};
}

/**
 * Finish an open: read what actually filled, then hedge exactly that.
 *
 * **The hedge is sized from the receipt, never from the quote.** A swap fills at
 * whatever the pool gives, which is not what was quoted — slippage, a moved
 * price, a partial route. Hedging the quoted size leaves the difference
 * unhedged in one direction or over-hedged in the other, and either is a
 * directional position dressed as a neutral one. Reading the transfer log costs
 * one RPC call and removes the entire class of error.
 */
export async function confirmOpen(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	actionId: string;
	txHash: string;
}): Promise<{ status: string; filled: number; shorted: number }> {
	const action = await requireAction(params.userId, params.actionId, "OPEN");
	const position = await requirePosition(params.userId, action.positionId);

	await touch(action.id, { status: "RUNNING", step: "hedge", txRef: params.txHash });

	const filled = await readTokenReceived({
		chainId: position.chainId,
		token: position.spotTokenAddress as Address,
		owner: params.owner as Address,
		txHash: params.txHash as Hex,
		decimals: position.spotTokenDecimals,
	});

	if (filled <= 0) {
		await fail(action.id, "That transaction did not deliver any of the spot token to your wallet.");
		throw new ExecutionError(
			"That transaction did not deliver any of the spot token to your wallet, so there is nothing to hedge. If the swap reverted, nothing has been spent.",
		);
	}

	// The spot leg is now real and nothing is hedging it. Recorded before the
	// short is attempted so that a failure below leaves an honest SPOT_ONLY row
	// rather than a position that claims a hedge it never got.
	const spotUnits = BigInt(Math.round(filled * 10 ** position.spotTokenDecimals));
	await prisma.selfPosition.update({
		where: { id: position.id },
		data: {
			status: "SPOT_ONLY",
			spotAmount: spotUnits.toString(),
			spotCostUsdc: String(BigInt(Math.round(payloadNumber(action.payload, "notionalUsd") * 1e6))),
			statusReason:
				"The spot leg has been bought and the hedge has not been placed yet. This position is directionally long until it is.",
		},
	});

	await recordEvent({
		positionId: position.id,
		kind: "OPEN_SPOT",
		venue: "aggregator",
		chainId: position.chainId,
		txRef: params.txHash,
		amount: spotUnits.toString(),
		detail: `Bought ${filled} ${position.spotTokenSymbol}.`,
	});

	try {
		const leverage = position.leverageBps / 10_000;
		if (leverage > 1) {
			// Set before the order, not after: leverage applied afterwards changes
			// the margin behind a position that is already open, which Pacifica may
			// refuse and which briefly misstates the liquidation price.
			await setLeverage({
				wallet: params.wallet,
				symbol: position.perpSymbol,
				leverage,
			});
		}

		const size = roundToLot(
			filled,
			position.ticker,
			await lotSizeFor(position.ticker, position.chainId),
		);

		await openShort({
			wallet: params.wallet,
			symbol: position.perpSymbol,
			amount: String(size),
			slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
		});

		await prisma.selfPosition.update({
			where: { id: position.id },
			data: {
				status: "OPEN",
				perpSize: String(size),
				openedAt: new Date(),
				statusReason: null,
			},
		});

		await recordEvent({
			positionId: position.id,
			kind: "OPEN_PERP",
			venue: "pacifica",
			amount: String(size),
			detail: `Shorted ${size} ${position.perpSymbol} against the spot leg.`,
		});

		await finish(action.id);
		return { status: "OPEN", filled, shorted: size };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		// The position stays SPOT_ONLY and says so. Not rolled back: selling the
		// spot leg back would need another signature from a user who is no longer
		// necessarily there, and would realise a loss to fix a problem that
		// retrying the hedge also fixes.
		await prisma.selfPosition.update({
			where: { id: position.id },
			data: {
				statusReason: `The spot leg is bought but the hedge failed: ${message}. This position is directionally long until the hedge is placed — retry it from here.`,
			},
		});
		await fail(action.id, message);

		throw new ExecutionError(
			`Your ${position.spotTokenSymbol} was bought, but the short could not be placed: ${message}. The position is showing as unhedged and you can retry the hedge without buying again.`,
			502,
		);
	}
}

/**
 * Place the missing hedge on a position that is holding spot alone.
 *
 * The recovery path for the failure above, and for a user who closed the tab
 * between the two legs. Separate from `confirmOpen` because it takes no
 * transaction and asks for no signature — everything it needs is already on
 * chain and on the venue.
 */
export async function hedgeSpotOnly(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	positionId: string;
}): Promise<{ shorted: number }> {
	const position = await requirePosition(params.userId, params.positionId);

	if (position.status !== "SPOT_ONLY" && position.status !== "DRIFTED") {
		throw new ExecutionError(`This position is ${position.status}, not waiting for a hedge.`);
	}

	const held = await readSpotBalance({
		chainId: position.chainId,
		token: position.spotTokenAddress as Address,
		owner: params.owner as Address,
		decimals: position.spotTokenDecimals,
	});

	const recorded = Number(position.spotAmount) / 10 ** position.spotTokenDecimals;
	// The smaller of the two, for the same reason the read path caps: the wallet
	// is the truth about what exists, and hedging more than exists is a short
	// nothing backs.
	const target = Math.min(held, recorded);

	if (target <= 0) {
		throw new ExecutionError(
			"There is no spot left in your wallet for this position, so there is nothing to hedge.",
		);
	}

	const existing = await readShort({ wallet: params.wallet, symbol: position.perpSymbol });
	const already = existing ? Math.abs(Number(existing.amount)) : 0;
	const missing = roundToLot(
		target - already,
		position.ticker,
		await lotSizeFor(position.ticker, position.chainId),
	);

	if (missing <= 0) {
		throw new ExecutionError("The short already covers this position's spot leg.");
	}

	await openShort({
		wallet: params.wallet,
		symbol: position.perpSymbol,
		amount: String(missing),
		slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
	});

	await prisma.selfPosition.update({
		where: { id: position.id },
		data: {
			status: "OPEN",
			perpSize: String(already + missing),
			openedAt: position.openedAt ?? new Date(),
			statusReason: null,
		},
	});

	await recordEvent({
		positionId: position.id,
		kind: "OPEN_PERP",
		venue: "pacifica",
		amount: String(missing),
		detail: `Hedged ${missing} ${position.perpSymbol} to cover a spot leg that was left exposed.`,
	});

	return { shorted: missing };
}

// ---------------------------------------------------------------------------
// Rebalancing
// ---------------------------------------------------------------------------

/**
 * Bring the legs back level by resizing the perp.
 *
 * Entirely server-side, and that is the point. The perp is the adjustable leg —
 * one fill, no signature, no wallet prompt — so routine maintenance of a hedge
 * never waits on a human. Correcting the spot side instead would cost two fills
 * and a signature to fix a drift the perp can absorb in one.
 */
export async function rebalance(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	positionId: string;
}): Promise<{ adjusted: number; direction: "increased" | "decreased" | "none" }> {
	const position = await requirePosition(params.userId, params.positionId);

	if (position.closedAt) {
		throw new ExecutionError("This position is closed.");
	}

	const held = await readSpotBalance({
		chainId: position.chainId,
		token: position.spotTokenAddress as Address,
		owner: params.owner as Address,
		decimals: position.spotTokenDecimals,
	});
	const recorded = Number(position.spotAmount) / 10 ** position.spotTokenDecimals;
	const spot = Math.min(held, recorded);

	const existing = await readShort({ wallet: params.wallet, symbol: position.perpSymbol });
	const short = existing ? Math.abs(Number(existing.amount)) : 0;

	const lot = await lotSizeFor(position.ticker, position.chainId);
	const gap = spot - short;
	const size = roundToLot(Math.abs(gap), position.ticker, lot);

	if (size <= 0) {
		return { adjusted: 0, direction: "none" };
	}

	// More spot than short: the position is net long and needs more short on.
	if (gap > 0) {
		await openShort({
			wallet: params.wallet,
			symbol: position.perpSymbol,
			amount: String(size),
			slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
		});
	} else {
		await closeShort({
			wallet: params.wallet,
			symbol: position.perpSymbol,
			amount: String(size),
			slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
		});
	}

	await prisma.selfPosition.update({
		where: { id: position.id },
		data: {
			status: "OPEN",
			spotAmount: String(BigInt(Math.round(spot * 10 ** position.spotTokenDecimals))),
			perpSize: String(gap > 0 ? short + size : short - size),
			statusReason: null,
		},
	});

	await recordEvent({
		positionId: position.id,
		kind: "REBALANCE",
		venue: "pacifica",
		amount: String(size),
		detail:
			gap > 0
				? `Shorted a further ${size} to cover spot the hedge had fallen behind.`
				: `Bought back ${size} of the short, which had grown past the spot leg.`,
	});

	return { adjusted: size, direction: gap > 0 ? "increased" : "decreased" };
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

/**
 * Stage a close: hand back the transaction that sells the spot leg.
 *
 * The user's leg goes first here for the same reason it does on the way in.
 * Closing the perp first would leave the position long-only for however long
 * the user takes to sign the sale — and someone closing a position is precisely
 * the person most likely to consider it done and walk away.
 */
export async function prepareClose(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	positionId: string;
}): Promise<PreparedAction> {
	const position = await requirePosition(params.userId, params.positionId);

	if (position.closedAt) {
		throw new ExecutionError("This position is already closed.");
	}

	const held = await readSpotBalance({
		chainId: position.chainId,
		token: position.spotTokenAddress as Address,
		owner: params.owner as Address,
		decimals: position.spotTokenDecimals,
	});
	const recorded = Number(position.spotAmount) / 10 ** position.spotTokenDecimals;
	const selling = Math.min(held, recorded);

	// A position whose spot is already gone needs no signature — only the short
	// has to be bought back, which the server can do alone.
	if (selling <= 0) {
		const action = await startAction({
			userId: params.userId,
			positionId: position.id,
			kind: "CLOSE",
			step: "perp",
			status: "RUNNING",
			chainId: position.chainId,
			payload: null,
		});

		return {
			actionId: action.id,
			kind: "CLOSE",
			step: "perp",
			steps: [],
			nextDescription:
				"There is no spot left to sell, so only the short has to be bought back. No signature is needed.",
		};
	}

	const amountIn = BigInt(Math.round(selling * 10 ** position.spotTokenDecimals));

	const swap = await buildSpotSwap({
		chainId: position.chainId,
		tokenIn: position.spotTokenAddress as Address,
		tokenOut: usdcFor(position.chainId),
		amountIn,
		owner: params.owner as Address,
	});

	const action = await startAction({
		userId: params.userId,
		positionId: position.id,
		kind: "CLOSE",
		step: "spot",
		status: "AWAITING_USER",
		chainId: position.chainId,
		payload: JSON.stringify({ selling }),
	});

	return {
		actionId: action.id,
		kind: "CLOSE",
		step: "spot",
		steps: swap.steps,
		nextDescription:
			"Once the sale confirms, the short is bought back on Pacifica and the margin is released. Your USDC stays in your own wallet throughout.",
	};
}

/**
 * Finish a close: buy back the short and settle the position.
 *
 * The margin is *not* withdrawn automatically. It stays on Pacifica, available
 * for the next position, because bridging it back to an EVM wallet is minutes
 * of waiting and a fee — and a user closing one position to open another would
 * pay both for nothing. Withdrawing is its own explicit action.
 */
export async function confirmClose(params: {
	userId: string;
	wallet: UserWalletSummary;
	owner: string;
	actionId: string;
	/** Absent when there was no spot left to sell. */
	txHash?: string;
}): Promise<{ status: string; closed: number }> {
	const action = await requireAction(params.userId, params.actionId, "CLOSE");
	const position = await requirePosition(params.userId, action.positionId);

	await touch(action.id, { status: "RUNNING", step: "perp", txRef: params.txHash ?? null });

	if (params.txHash) {
		await recordEvent({
			positionId: position.id,
			kind: "CLOSE_SPOT",
			venue: "aggregator",
			chainId: position.chainId,
			txRef: params.txHash,
			detail: `Sold the ${position.spotTokenSymbol} leg.`,
		});
	}

	const existing = await readShort({ wallet: params.wallet, symbol: position.perpSymbol });
	const short = existing ? Math.abs(Number(existing.amount)) : 0;

	if (short > 0) {
		try {
			await closeShort({
				wallet: params.wallet,
				symbol: position.perpSymbol,
				amount: String(short),
				slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Spot is sold and the short is still on: the position is now net
			// short. Named as loudly as the other direction, because an unhedged
			// short is the one most people do not expect to be holding.
			await prisma.selfPosition.update({
				where: { id: position.id },
				data: {
					status: "PERP_ONLY",
					spotAmount: "0",
					statusReason: `The spot leg is sold but the short could not be closed: ${message}. This position is now directionally short until it is.`,
				},
			});
			await fail(action.id, message);

			throw new ExecutionError(
				`Your ${position.spotTokenSymbol} was sold, but the short could not be bought back: ${message}. The position is showing as short-only — retry the close from here.`,
				502,
			);
		}

		await recordEvent({
			positionId: position.id,
			kind: "CLOSE_PERP",
			venue: "pacifica",
			amount: String(short),
			detail: `Bought back ${short} ${position.perpSymbol}.`,
		});
	}

	await prisma.selfPosition.update({
		where: { id: position.id },
		data: {
			status: "CLOSED",
			spotAmount: "0",
			perpSize: "0",
			closedAt: new Date(),
			statusReason: null,
			// Funding is the honest part of the return we hold a running total
			// for; price P&L across two venues and a user's own wallet is not
			// something this app can claim to have measured completely.
			realisedPnlUsdc: position.fundingUsdc,
		},
	});

	await finish(action.id);
	return { status: "CLOSED", closed: short };
}

// ---------------------------------------------------------------------------
// Building the user's swap
// ---------------------------------------------------------------------------

/**
 * Quote and encode a swap, plus the approval it needs.
 *
 * The approval is included unconditionally when the allowance is short rather
 * than being left to the browser to work out. Two facts make that the safer
 * choice: the spender is **not** always the transaction target — KyberSwap's
 * coincide, other routers' do not — and approving the wrong one of the two is a
 * revert on `transferFrom` with a full allowance visible on the explorer, which
 * is among the harder failures to diagnose from a wallet UI.
 */
async function buildSpotSwap(params: {
	chainId: number;
	tokenIn: Address;
	tokenOut: Address;
	amountIn: bigint;
	owner: Address;
}): Promise<{ steps: UnsignedStep[]; amountOut: string }> {
	const aggregator = clients.aggregatorFor(params.chainId);

	const route = await aggregator.getRoute({
		tokenIn: params.tokenIn,
		tokenOut: params.tokenOut,
		amountIn: params.amountIn.toString(),
		slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
		sender: params.owner,
	});

	if (!route.ok) {
		throw new ExecutionError(
			`No route for this trade on ${requireChainInfo(params.chainId).name}: ${route.message}`,
		);
	}

	const built = await aggregator.buildRoute({
		routeSummary: route.quote.routeSummary,
		sender: params.owner,
		recipient: params.owner,
		slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
	});

	const steps: UnsignedStep[] = [];

	const allowance = await clientFor(params.chainId).readContract({
		address: params.tokenIn,
		abi: erc20Abi,
		functionName: "allowance",
		args: [params.owner, built.routerAddress],
	});

	if (allowance < params.amountIn) {
		steps.push({
			label: "Approve the router",
			to: params.tokenIn,
			data: encodeApproval(built.routerAddress),
			value: "0",
			chainId: params.chainId,
		});
	}

	steps.push({
		label: "Swap",
		to: built.to,
		data: built.data,
		value: built.value,
		chainId: params.chainId,
	});

	return { steps, amountOut: built.amountOut };
}

/**
 * An unlimited approval, which is a choice worth defending.
 *
 * The alternative — approving exactly this trade's amount — sounds safer and
 * costs a second approval transaction on every subsequent open, close and
 * partial. Users respond to that by approving unlimited themselves, in a wallet
 * UI with less context than this one. The spender is an aggregator router the
 * quote just named, and the allowance sits on the user's own wallet where they
 * can revoke it.
 */
function encodeApproval(spender: Address): Hex {
	return encodeFunctionData({
		abi: erc20Abi,
		functionName: "approve",
		args: [spender, maxUint256],
	});
}

// ---------------------------------------------------------------------------
// Reading what actually happened
// ---------------------------------------------------------------------------

/**
 * How much of a token one transaction actually delivered to an address.
 *
 * Read from the receipt's `Transfer` logs rather than from the quote, because
 * the quote is a prediction and this is the number the hedge is sized from. A
 * swap routed through several pools emits several transfers; only the ones
 * crediting the owner count, and they are summed because the final hop can
 * arrive in pieces.
 */
async function readTokenReceived(params: {
	chainId: number;
	token: Address;
	owner: Address;
	txHash: Hex;
	decimals: number;
}): Promise<number> {
	const client = clientFor(params.chainId);
	const receipt = await client.getTransactionReceipt({ hash: params.txHash });

	if (receipt.status !== "success") {
		throw new ExecutionError("That transaction reverted, so nothing was bought.");
	}

	let total = 0n;

	for (const log of receipt.logs) {
		if (log.address.toLowerCase() !== params.token.toLowerCase()) continue;

		try {
			const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
			if (event.eventName !== "Transfer") continue;
			const args = event.args as unknown as { to: Address; value: bigint };
			if (args.to.toLowerCase() !== params.owner.toLowerCase()) continue;
			total += args.value;
		} catch {
			// A log from the same address that is not a Transfer — routers emit
			// plenty. Not an error; just not what is being counted.
		}
	}

	return Number(total) / 10 ** params.decimals;
}

async function readSpotBalance(params: {
	chainId: number;
	token: Address;
	owner: Address;
	decimals: number;
}): Promise<number> {
	const balance = await clientFor(params.chainId).readContract({
		address: params.token,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [params.owner],
	});
	return Number(balance) / 10 ** params.decimals;
}

/**
 * Round a size down to the venue's lot size.
 *
 * Down, never to nearest. Rounding up on an open asks for a short larger than
 * the spot backing it, which converts a rounding convenience into a small
 * permanent directional position; rounding up on a close is rejected outright
 * by `reduceOnly`.
 */
export function roundToLot(size: number, _ticker: string, lot: number): number {
	if (!Number.isFinite(size) || size <= 0) return 0;
	if (!Number.isFinite(lot) || lot <= 0) return size;

	// The rounding has to happen *before* the floor, not after it. `0.3 / 0.1` is
	// 2.9999999999999996 in binary floating point, so flooring the raw quotient
	// yields two lots and under-hedges by a third — silently, on a size a user
	// typed as a perfectly ordinary number. Nine digits is far below the
	// precision of any lot size a venue quotes and far above the error this
	// introduces.
	const lots = Math.floor(Number((size / lot).toFixed(9)));
	return Number((lots * lot).toFixed(10));
}

/**
 * The venue's lot size for a market.
 *
 * Takes the chain because the lookup does, even though the answer cannot differ
 * by chain — the lot size is Pacifica's and there is one Pacifica. Passing it
 * anyway avoids a lookup that silently falls back to the default chain and
 * returns `undefined` for a market that only exists on another one, which would
 * round every size to an unrounded pass-through.
 */
async function lotSizeFor(ticker: string, chainId: number): Promise<number> {
	const market = await getBasisMarket(ticker, chainId);
	return market?.perp.lotSize ?? 0;
}

// ---------------------------------------------------------------------------
// Action bookkeeping
// ---------------------------------------------------------------------------

async function walletIdFor(userId: string): Promise<string> {
	const wallet = await prisma.userWallet.findUnique({ where: { userId }, select: { id: true } });
	if (!wallet) {
		throw new ExecutionError("No margin wallet has been derived for this account yet.", 409);
	}
	return wallet.id;
}

/**
 * Begin an action, refusing if one is already live on the position.
 *
 * The uniqueness is the database's rather than a read-then-write, because two
 * browser tabs racing an open would both pass a check and both buy spot — one
 * position, two spot legs, one hedge.
 */
async function startAction(params: {
	userId: string;
	positionId: string | null;
	kind: string;
	step: string;
	status: "AWAITING_USER" | "RUNNING";
	chainId: number | null;
	payload: string | null;
}) {
	try {
		return await prisma.selfAction.create({
			data: {
				userId: params.userId,
				positionId: params.positionId,
				kind: params.kind,
				step: params.step,
				status: params.status,
				chainId: params.chainId,
				payload: params.payload,
				runningKey: params.positionId,
			},
		});
	} catch {
		throw new ExecutionError(
			"Something is already in progress on this position. Finish or cancel it before starting another.",
			409,
		);
	}
}

async function requireAction(userId: string, actionId: string, kind: string) {
	const action = await prisma.selfAction.findFirst({ where: { id: actionId, userId } });
	if (!action) throw new ExecutionError("No such action.", 404);
	if (action.kind !== kind) {
		throw new ExecutionError(`That action is a ${action.kind}, not a ${kind}.`, 409);
	}
	if (action.status === "DONE") {
		throw new ExecutionError("That step has already been completed.", 409);
	}
	return action;
}

async function requirePosition(userId: string, positionId: string | null) {
	if (!positionId) throw new ExecutionError("That action is not attached to a position.", 409);
	const position = await prisma.selfPosition.findFirst({ where: { id: positionId, userId } });
	if (!position) throw new ExecutionError("No such position.", 404);
	return position;
}

async function touch(
	id: string,
	data: { status?: "RUNNING"; step?: string; txRef?: string | null },
) {
	await prisma.selfAction.update({
		where: { id },
		data: { ...data, heartbeatAt: new Date() },
	});
}

async function finish(id: string) {
	await prisma.selfAction.update({
		where: { id },
		// `runningKey` is nulled so the position can be acted on again. It is the
		// same field the uniqueness above is enforced on, so leaving it set would
		// lock the position out of every future action.
		data: { status: "DONE", finishedAt: new Date(), runningKey: null },
	});
}

async function fail(id: string, error: string) {
	await prisma.selfAction.update({
		where: { id },
		data: { status: "FAILED", error, finishedAt: new Date(), runningKey: null },
	});
}

async function recordEvent(params: {
	positionId: string;
	kind: string;
	venue: string;
	chainId?: number;
	txRef?: string;
	amount?: string;
	valueUsdc?: string;
	detail?: string;
}) {
	await prisma.selfPositionEvent.create({
		data: {
			positionId: params.positionId,
			kind: params.kind,
			venue: params.venue,
			chainId: params.chainId ?? null,
			txRef: params.txRef ?? null,
			amount: params.amount ?? null,
			valueUsdc: params.valueUsdc ?? null,
			detail: params.detail ?? null,
		},
	});
}

function payloadNumber(payload: string | null, key: string): number {
	if (!payload) return 0;
	try {
		const parsed = JSON.parse(payload) as Record<string, unknown>;
		const value = parsed[key];
		return typeof value === "number" ? value : 0;
	} catch {
		return 0;
	}
}
