import { AGENT_CHAIN, resolveAgentChain } from "@lemon/agent/chain";
import { decide, sizingLeverageBps, type VaultSnapshot } from "@lemon/agent/policy";
import { type IndexedVault, resolveVenue } from "@lemon/agent/runtime";
import { createSolanaExecutor } from "@lemon/agent/solana";
import { type ActivityInput, VaultClient } from "@lemon/agent/vault";
import { agentWalletFor } from "@lemon/agent/wallet";
import type { QueueEntry, VenueAdapter } from "@lemon/agent/worker";
import { VenueExecutionError } from "@lemon/agent/worker";
import { lemonVaultAbi } from "@lemon/contracts";
import { createLogger, type LogLevel } from "@lemon/core";
import { type OperatorAction, prisma, type VaultConfig, vaultRef, vaultWhere } from "@lemon/db";
import {
	type Address,
	createPublicClient,
	createWalletClient,
	http,
	type PublicClient,
} from "viem";
import { clients, config } from "../config";
import { AdminError, assertConfigured } from "./admin";

/**
 * Closing and re-opening a vault's position, from the console.
 *
 * **The agent is never asked to do this.** It used to be: an operator pressed
 * "close positions", a flag went onto `VaultConfig`, and the agent carried it
 * out in one all-or-nothing call on whatever tick came next. Every part of that
 * is a bad fit for a decision a person makes about live money. The tick might be
 * a minute away or the process might be down; the operator learned what had
 * happened to the position only after it had happened; a close that failed
 * halfway offered nothing but the same all-or-nothing call again; and the same
 * flag that performed the close also had to survive it, which made "close this
 * now" and "keep this vault flat" one setting instead of two.
 *
 * So closing happens here, signed from the vault's own MPC-derived wallet by
 * this process while the operator watches each leg land. The flag survives as a
 * constraint — the vault deploys nothing — which is what stops a restarted
 * agent undoing a wind-down, and which is all the agent's policy reads from it.
 *
 * The work itself is the agent's own wiring, not a second implementation of it:
 * `resolveVenue` builds the identical adapter against the identical market list,
 * so the token a step sells is the token the agent would have sold, and
 * `decide` picks what a re-open deploys. Nothing here re-implements a venue call
 * or a sizing rule.
 *
 * **Three things it deliberately does not do.** It does not report NAV, settle
 * the redemption queue, or publish funding — those are the agent's writes on the
 * agent's schedule, and a second writer racing it is how a watermark ends up
 * differenced twice. It does publish the activity the steps produce, because the
 * agent is stopped by the time these run and nothing else ever would: a full
 * unwind missing from the depositor-facing feed is a worse failure than a
 * duplicated row, and the exclusivity rules below mean there is no other writer
 * to duplicate against.
 *
 * It also does not pay redemptions, and the agent's continuing to do so is the
 * reason a wind-down stops at "deploy nothing". Somebody who asked for their
 * money out is owed it within seven days whatever an operator has decided about
 * the vault's future, so the policy still unwinds for a ripe request — see
 * `permittedActions`.
 *
 * **The agent must be stopped.** Enforced, not advised. Both processes sign from
 * one MPC-derived wallet with one nonce stream and one Pacifica account, so an
 * agent ticking underneath a hand-run close is two writers on the same wallet —
 * a `nonce too low` on Base and a pair of racing reduce-only orders at the
 * venue. Stopping the agent is one click on the same console.
 *
 * **One chain per process,** for the same reason the agent has one container per
 * chain: `AGENT_CHAIN_ID` decides which chain's RPC, USDC and token registry the
 * agent's wiring uses, and the API inherits that. A vault that custodies
 * elsewhere is refused by name rather than half-resolved, which is what
 * `assertOnThisChain` is for.
 */

/**
 * Everything an operator can run by hand, in the order they would run it.
 *
 * `CLOSE_ALL` and the four steps after it are two ways of doing the same thing,
 * and both are worth having. The whole close is one press for the ordinary case
 * — an operator who wants the vault flat and the money home and has no reason to
 * stand between the legs. The four are for when that is not the situation: a
 * close that failed at the bridge needs the bridge retried and nothing else, and
 * running the whole thing again would start from a spot sale with nothing left
 * to sell.
 *
 * `REOPEN` is the other direction, and the only one here that spends rather than
 * raises. It is not the inverse of a close — see `reopen` for why one press
 * deploys into one market.
 */
export const OPERATOR_STEPS = [
	"CLOSE_ALL",
	"CLOSE_SPOT",
	"CLOSE_PERP",
	"BRIDGE_HOME",
	"RETURN_TO_VAULT",
	"REOPEN",
] as const;

export type OperatorStep = (typeof OPERATOR_STEPS)[number];

/**
 * What a step did, over and above the activity it produced.
 *
 * `detail` overrides the sentence `describeStep` would derive from the rows, and
 * exists for the one step whose interesting outcome is not visible in them:
 * `REOPEN` can finish correctly having deployed nothing, because the agent's own
 * policy looked at the vault and said not yet. That answer is the whole result,
 * and it produces no activity to read it off.
 */
interface StepResult {
	activity: ActivityInput[];
	detail?: string;
}

/** What every step is handed. The wiring, built once per run. */
interface StepContext {
	venue: VenueAdapter;
	vault: VaultClient;
	config: VaultConfig;
	log: (level: LogLevel, message: string, extra?: unknown) => void;
}

/**
 * Run one step. One mapping from name to work, so nothing can drift.
 *
 * Five of the six are a single adapter call — the adapter is where every venue
 * call lives, and these are the same ones the agent makes. `REOPEN` is the
 * exception because deploying is a decision before it is a call: it needs the
 * vault's state and the redemption queue, and those are the agent's policy's
 * inputs rather than the adapter's.
 */
const STEP_RUNNERS: Record<OperatorStep, (ctx: StepContext) => Promise<StepResult>> = {
	CLOSE_ALL: async ({ venue }) => ({ activity: await venue.closeAll() }),
	CLOSE_SPOT: async ({ venue }) => ({ activity: await venue.closeSpot() }),
	CLOSE_PERP: async ({ venue }) => ({ activity: await venue.closePerp() }),
	BRIDGE_HOME: async ({ venue }) => ({ activity: await venue.bridgeHome() }),
	RETURN_TO_VAULT: async ({ venue }) => ({ activity: await venue.returnIdle() }),
	REOPEN: reopen,
};

/**
 * What a step does, in the operator's own words, for a row that has none.
 *
 * Used when a step finished having moved nothing — which is a real and common
 * outcome, not a failure: a vault whose spot is already sold runs `CLOSE_SPOT`
 * to completion and finds nothing to sell.
 */
const NOTHING_HAPPENED: Record<OperatorStep, string> = {
	CLOSE_ALL: "The vault was already flat and the agent held nothing, so nothing moved.",
	CLOSE_SPOT: "No spot was held, so nothing was sold.",
	CLOSE_PERP: "No short was open, so nothing was closed.",
	BRIDGE_HOME: "The venue had no free margin and the Solana wallet was empty, so nothing crossed.",
	RETURN_TO_VAULT: "The agent held no USDC, so nothing was returned.",
	REOPEN: "Nothing was deployed.",
};

/**
 * How often a running step says it is still alive, and when to stop believing it.
 *
 * These steps live in the memory of one API process and are not resumed if it
 * restarts, so "RUNNING" on its own is not evidence that anything is running. A
 * heartbeat is: a row whose last one is older than the threshold belongs to a
 * process that is gone, and the lock it holds has to be reclaimable or the vault
 * is stuck behind a step nobody is running.
 *
 * The threshold is generous against the heartbeat because the alternative error
 * is much worse. Reclaiming a lock from a step that is genuinely still bridging
 * puts a second writer on the agent's wallet, which is the thing the lock exists
 * to prevent.
 */
const HEARTBEAT_MS = 30_000;
const HEARTBEAT_STALE_MS = 5 * 60_000;

const logger = createLogger("operator");

export interface OperatorActionView {
	id: string;
	vault: string;
	chainId: number;
	step: OperatorStep;
	status: "RUNNING" | "DONE" | "FAILED" | "ABANDONED";
	requestedBy: string;
	/** What happened, in a sentence. Null while it is still happening. */
	detail: string | null;
	error: string | null;
	/** Rows this step published to the vault's public activity feed. */
	activityReported: number;
	startedAt: string;
	finishedAt: string | null;
	/**
	 * True for a row that claims to be running but has stopped saying so.
	 *
	 * Distinguished from `FAILED` on purpose: the venue calls a step had already
	 * made still stand, and what this reports is that the *record* was orphaned —
	 * by a deploy, a crash, a container moving — not that the money did not move.
	 * The position is the answer to what actually happened, which is why the
	 * console shows it beside this.
	 */
	stale: boolean;
}

/** One market's two legs, as the venues report them right now. */
export interface PositionLeg {
	ticker: string;
	symbol: string;
	perpSymbol: string;
	/** Spot held by the agent, at the 1e18 basis both legs are compared in. */
	spotUnits: string;
	/** What that spot would fetch if sold now, in USDC base units. Null when unroutable. */
	spotValueUsdc: string | null;
	/** The short's size, same basis as `spotUnits`. */
	perpUnits: string;
	/** The short's notional at the current mark, in USDC base units. */
	perpNotionalUsdc: string;
}

/**
 * Everything a hand-driven unwind needs to see before it presses anything.
 *
 * Read from the venues rather than from the vault's reported NAV, because the
 * whole point of running these steps is that the reported figure may be stale —
 * the agent is stopped, which is what stales it.
 */
export interface PositionSnapshot {
	vault: string;
	chainId: number;
	chainName: string;
	/** True while the agent is running, which is when every step is refused. */
	agentEnabled: boolean;
	markets: PositionLeg[];
	/** USDC in the agent's wallet on this chain, waiting to be returned. */
	idleOnBase: string;
	/** Margin at the perp venue backing no open position. */
	unallocatedMargin: string;
	/** USDC between the two chains right now, which is neither side's balance. */
	inFlight: string;
	/**
	 * Why the venues could not be read, when they could not.
	 *
	 * Set rather than thrown. An operator reaching for these steps is often
	 * reaching for them *because* something upstream is broken, and a panel that
	 * refuses to render is a panel that cannot be used on the day it matters —
	 * the buttons still work, they simply run without a picture beside them.
	 */
	unavailable: string | null;
}

export function toView(row: OperatorAction): OperatorActionView {
	const stale =
		row.status === "RUNNING" && Date.now() - row.heartbeatAt.getTime() > HEARTBEAT_STALE_MS;

	return {
		id: row.id,
		vault: row.vaultAddress,
		chainId: row.chainId,
		step: row.step as OperatorStep,
		status: row.status as OperatorActionView["status"],
		requestedBy: row.requestedBy,
		detail: row.detail,
		error: row.error,
		activityReported: row.activityReported,
		startedAt: row.startedAt.toISOString(),
		finishedAt: row.finishedAt?.toISOString() ?? null,
		stale,
	};
}

/**
 * Recent steps against one vault, newest first.
 *
 * Cheap on purpose — one indexed read, no venue calls — because this is what the
 * console polls while a step runs. The expensive picture is `positionSnapshot`,
 * which is fetched when the panel opens and when an operator asks for it again.
 */
export async function recentOperatorActions(
	address: string,
	chainId?: number,
	limit = 12,
): Promise<OperatorActionView[]> {
	const existing = await assertConfigured(address, chainId);
	await releaseStale(existing.chainId, existing.address);

	const rows = await prisma.operatorAction.findMany({
		where: { chainId: existing.chainId, vaultAddress: existing.address },
		orderBy: { startedAt: "desc" },
		take: Math.min(limit, 50),
	});

	return rows.map(toView);
}

/**
 * Start one step, and answer as soon as it has started.
 *
 * Deliberately not awaited to completion. A spot sale is a swap and a couple of
 * confirmations; a bridge is a venue withdrawal settling on Pacifica's schedule
 * and then a Relay fill, which together can run for the better part of an hour.
 * An HTTP request held open across that is one a proxy closes long before the
 * money lands, and the operator would be left unable to tell a timed-out request
 * from a failed unwind. So the row is the handle: it is created RUNNING, the
 * work continues in this process, and the console watches the row.
 */
export async function startOperatorAction(params: {
	address: string;
	chainId?: number;
	step: OperatorStep;
	by: string;
	/**
	 * Why, in the operator's own words, for a close that winds the vault down.
	 *
	 * Kept on the vault rather than on the step, and kept after the wind-down is
	 * lifted: "who unwound this vault in March and why" is a question that gets
	 * asked long after the answer has left anyone's memory.
	 */
	reason?: string;
}): Promise<OperatorActionView> {
	const existing = await assertConfigured(params.address, params.chainId);
	assertOnThisChain(existing);

	if (existing.agentEnabled) {
		// Refused rather than warned. The agent signs from the same wallet with the
		// same nonce stream and trades the same Pacifica account, so a tick landing
		// in the middle of this is two writers on one position — and the failure is
		// not a clean revert but a half-placed pair of orders.
		throw new AdminError(
			`The agent for ${existing.ticker} is still running, and it signs from the wallet this step would sign from. Stop the agent first — "Stop agent" on the vault's row — then run the steps.`,
			409,
		);
	}

	if (!existing.agentPath) {
		throw new AdminError(
			`No derivation path is recorded for ${existing.address}, so nothing can sign for its agent wallet. Nothing is lost — the path is a function of the ticker and tier — but it has to be restored in the database first.`,
			409,
		);
	}

	await releaseStale(existing.chainId, existing.address);

	let action: OperatorAction;
	try {
		action = await prisma.operatorAction.create({
			data: {
				chainId: existing.chainId,
				vaultAddress: existing.address,
				step: params.step,
				status: "RUNNING",
				requestedBy: params.by.toLowerCase(),
				reason: params.reason?.trim() || null,
				// The lock. A unique column that is null once the step finishes, so a
				// second running row for this vault cannot be inserted at all.
				runningKey: runningKey(existing.chainId, existing.address),
			},
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new AdminError(
				"A step is already running against this vault. These move real funds one at a time — wait for it to finish, or for its heartbeat to go cold if the process running it is gone.",
				409,
			);
		}
		throw error;
	}

	// Started, not awaited. Everything after this point reports through the row.
	void run(action, existing);

	return toView(action);
}

/**
 * What the venues say the vault is holding right now.
 *
 * Every number here is read live: the spot legs are ERC-20 balances quoted
 * through the same aggregator that would sell them, the shorts come from
 * Pacifica, and the idle balances are the agent's own. None of it is the vault's
 * reported NAV, which is the figure an operator running these steps has the most
 * reason to distrust.
 */
export async function positionSnapshot(
	address: string,
	chainId?: number,
): Promise<PositionSnapshot> {
	const existing = await assertConfigured(address, chainId);
	assertOnThisChain(existing);

	const empty: PositionSnapshot = {
		vault: existing.address,
		chainId: existing.chainId,
		chainName: AGENT_CHAIN.name,
		agentEnabled: existing.agentEnabled,
		markets: [],
		idleOnBase: "0",
		unallocatedMargin: "0",
		inFlight: "0",
		unavailable: null,
	};

	try {
		const { venue } = await resolveRunner(existing);
		const observed = await venue.observe();

		return {
			...empty,
			markets: observed.markets.map((market) => ({
				ticker: market.ticker,
				symbol: market.symbol,
				perpSymbol: market.perpSymbol,
				spotUnits: market.spotUnits.toString(),
				// `spotValueUsdc` is zero both for a leg worth nothing and for one
				// whose pool cannot be routed today, and those are different facts. The
				// second is what `spotSellable` reports, and it is the one that decides
				// whether `CLOSE_SPOT` can do anything at all.
				spotValueUsdc: market.spotSellable ? market.spotValueUsdc.toString() : null,
				perpUnits: market.perpUnits.toString(),
				perpNotionalUsdc: market.perpNotionalUsdc.toString(),
			})),
			idleOnBase: observed.idleOnBase.toString(),
			unallocatedMargin: observed.unallocatedMargin.toString(),
			inFlight: observed.valuation.components.inFlight.toString(),
		};
	} catch (error) {
		return { ...empty, unavailable: message(error) };
	}
}

// ---------------------------------------------------------------------------
// Running one step
// ---------------------------------------------------------------------------

/**
 * Place the orders, publish what they produced, and close the row out.
 *
 * Never throws: it is started with `void`, so a rejection here would be an
 * unhandled one and — much worse — a row left RUNNING with nothing running. Every
 * exit from this function writes a terminal status.
 */
async function run(action: OperatorAction, vaultConfig: VaultConfig): Promise<void> {
	const label = `${vaultConfig.ticker} ${action.step}`;
	const log = (level: LogLevel, message: string, extra?: unknown) =>
		logger.emit(level, `${label}: ${message}`, extra);

	// While the step runs, so an orphaned row can be told from a slow one. Cleared
	// in `finally` — a beating heart on a finished row would hold the lock.
	const beat = setInterval(() => {
		prisma.operatorAction
			.update({ where: { id: action.id }, data: { heartbeatAt: new Date() } })
			.catch((error) => log("warn", "could not record a heartbeat.", error));
	}, HEARTBEAT_MS);

	// Held outside the try so the failure path can still reach the vault client.
	// A venue error carries legs that already moved money, and those have to be
	// publishable without building the whole wiring a second time.
	let runner: { venue: VenueAdapter; vault: VaultClient } | null = null;

	try {
		runner = await resolveRunner(vaultConfig, log);

		log("info", "starting; the agent is stopped and this process is the only writer.");
		const step = action.step as OperatorStep;
		const result = await STEP_RUNNERS[step]({ ...runner, config: vaultConfig, log });
		const reported = await publish(runner.vault, result.activity, log);
		const standing = await recordStanding(step, action, result, log);

		await finish(action.id, {
			status: "DONE",
			detail: [result.detail ?? describeStep(step, result.activity), standing]
				.filter(Boolean)
				.join(" "),
			activityReported: reported,
		});
		log("info", "done.");
	} catch (error) {
		// A venue error carries the legs that *did* land before it failed, and those
		// moved real money — they reach the public feed even though the step did
		// not finish. Publishing them is the difference between a depositor seeing a
		// half-completed unwind and seeing nothing at all.
		const landed = error instanceof VenueExecutionError ? error.activity : [];
		const reported = landed.length > 0 && runner ? await publish(runner.vault, landed, log) : 0;

		await finish(action.id, {
			status: "FAILED",
			detail: landed.length > 0 ? describeStep(action.step as OperatorStep, landed) : null,
			error: message(error),
			activityReported: reported,
		});
		log("error", "failed.", error);
	} finally {
		clearInterval(beat);
	}
}

/**
 * Say what the vault is *for* now that the step has finished.
 *
 * The flag on `VaultConfig` used to be an instruction — "agent, close
 * everything" — and the agent carried it out on its next tick. It is a
 * constraint now: it forbids deployment and nothing else, because closing is
 * this service's own job. That makes it the natural bookkeeping for the two
 * whole-vault steps, and it is the piece an operator would otherwise have to
 * remember separately:
 *
 *  - A close that has emptied the vault sets it, so that starting the agent
 *    again does not put the capital straight back to work. Without this, the
 *    reward for closing a vault by hand is a position re-opened by the first
 *    tick after somebody restarts the agent.
 *  - A re-open lifts it, because an operator deploying by hand plainly means
 *    the vault should hold a position — and leaving it set would stop the agent
 *    adding to the position this step just opened.
 *
 * Best-effort and reported rather than thrown: the venue calls have already
 * happened by this point, and failing the step over a database write would
 * report a close that did happen as one that did not.
 */
async function recordStanding(
	step: OperatorStep,
	action: OperatorAction,
	result: StepResult,
	log: (level: LogLevel, message: string, extra?: unknown) => void,
): Promise<string> {
	const where = vaultWhere(vaultRef(action.chainId, action.vaultAddress));

	try {
		if (step === "CLOSE_ALL") {
			await prisma.vaultConfig.update({
				where,
				data: {
					closeRequestedAt: new Date(),
					closeRequestedBy: action.requestedBy,
					closeReason: action.reason,
					// Stamped here rather than waiting for a tick to notice: this step
					// is the thing that made the vault flat, and it has just finished.
					closeCompletedAt: new Date(),
				},
			});
			return "The vault is marked as winding down, so the agent will not deploy into it — including after it is started again.";
		}

		// Only when something was actually placed. A re-open that finished having
		// deployed nothing — the policy would rather hold, and said why — has not
		// changed what the vault is for, and lifting the wind-down on the strength
		// of it would let the agent start deploying on the operator's behalf.
		if (step === "REOPEN" && result.activity.length > 0) {
			const { count } = await prisma.vaultConfig.updateMany({
				where: {
					chainId: action.chainId,
					address: action.vaultAddress,
					NOT: { closeRequestedAt: null },
				},
				data: { closeRequestedAt: null, closeRequestedBy: null, closeCompletedAt: null },
			});
			return count > 0
				? "The wind-down was lifted, so the agent may deploy into this vault again."
				: "";
		}
	} catch (error) {
		log("warn", "could not record the vault's standing order.", error);
		return "The venue calls landed, but the vault's wind-down flag could not be updated — check it before starting the agent.";
	}

	return "";
}

/** Close a row out, releasing the lock with it. */
async function finish(
	id: string,
	result: {
		status: "DONE" | "FAILED";
		detail?: string | null;
		error?: string;
		activityReported: number;
	},
): Promise<void> {
	try {
		await prisma.operatorAction.update({
			where: { id },
			data: {
				status: result.status,
				detail: result.detail ?? null,
				error: result.error ?? null,
				activityReported: result.activityReported,
				finishedAt: new Date(),
				// Nulled, which is what frees the vault for the next step: the unique
				// index only constrains rows that hold a key.
				runningKey: null,
			},
		});
	} catch (error) {
		// Nothing left to report through — the row *is* the reporting channel. The
		// heartbeat stops with this function, so the row ages into `stale` and the
		// lock becomes reclaimable rather than permanent.
		logger.emit("error", `Could not close out operator action ${id}.`, error);
	}
}

/**
 * Hand the activity to the vault's public feed.
 *
 * Best-effort, and deliberately after the venue calls rather than between them.
 * The trades have already happened by the time this runs, so a failed report
 * costs a row in the feed; a report that failed the step would cost the record
 * of a close that did happen.
 */
async function publish(
	vault: VaultClient,
	activity: ActivityInput[],
	log: (level: LogLevel, message: string, extra?: unknown) => void,
): Promise<number> {
	if (activity.length === 0) return 0;
	try {
		await vault.reportActivity(activity);
		return activity.length;
	} catch (error) {
		log("warn", `could not publish ${activity.length} activity row(s) to the vault's feed.`, error);
		return 0;
	}
}

/**
 * What a step did, from the rows it produced.
 *
 * Read off the activity rather than reported by the step itself, because the
 * rows are what actually reached the chain — and it is the same record a
 * depositor sees on the vault page, so the console and the feed cannot disagree.
 *
 * Exported for its tests: this sentence is the whole of what an operator learns
 * from a step that has finished, and the arithmetic in it is worth asserting
 * without a venue.
 */
export function describeStep(step: OperatorStep, activity: ActivityInput[]): string {
	const of = (kind: string) => activity.filter((row) => row.kind === kind);

	if (step === "CLOSE_SPOT") {
		const sells = of("SPOT_SELL");
		if (sells.length === 0) return NOTHING_HAPPENED.CLOSE_SPOT;
		const proceeds = sells.reduce((sum, row) => sum + row.notionalAssets, 0n);
		return `Sold ${sells.length} spot leg${sells.length === 1 ? "" : "s"} for ${usd(proceeds)}, which is sitting in the agent's wallet until it is returned.`;
	}

	if (step === "CLOSE_PERP") {
		const closes = of("PERP_CLOSE");
		if (closes.length === 0) return NOTHING_HAPPENED.CLOSE_PERP;
		const symbols = closes.map((row) => row.symbol).join(", ");
		return `Closed ${closes.length} short${closes.length === 1 ? "" : "s"} (${symbols}). The margin behind them is still at the venue.`;
	}

	if (step === "BRIDGE_HOME") {
		const crossings = of("BRIDGE_OUT");
		if (crossings.length === 0) return NOTHING_HAPPENED.BRIDGE_HOME;
		const sent = crossings.reduce((sum, row) => sum + row.baseAmount, 0n);
		const fees = crossings.reduce((sum, row) => sum + row.feeAssets, 0n);
		return `Brought ${usd(sent - fees)} home to the agent's wallet${fees > 0n ? `, after ${usd(fees)} in bridge fees` : ""}. It still has to be returned to the vault.`;
	}

	if (step === "RETURN_TO_VAULT") {
		const returns = of("BRIDGE_IN");
		if (returns.length === 0) return NOTHING_HAPPENED.RETURN_TO_VAULT;
		const returned = returns.reduce((sum, row) => sum + row.notionalAssets, 0n);
		return `Returned ${usd(returned)} to the vault. It is free assets now, and redemptions can be paid out of it.`;
	}

	if (step === "CLOSE_ALL") {
		// Every leg of a whole close in one sentence, and the last figure is the
		// one that matters: what reached the vault. The rest moved between
		// accounts the agent controls, where a depositor cannot be paid out of it.
		const closes = of("PERP_CLOSE");
		const sells = of("SPOT_SELL");
		const returned = of("BRIDGE_IN").reduce((sum, row) => sum + row.notionalAssets, 0n);
		if (closes.length === 0 && sells.length === 0 && returned === 0n) {
			return NOTHING_HAPPENED.CLOSE_ALL;
		}
		const parts: string[] = [];
		if (sells.length > 0)
			parts.push(`sold ${sells.length} spot leg${sells.length === 1 ? "" : "s"}`);
		if (closes.length > 0)
			parts.push(`closed ${closes.length} short${closes.length === 1 ? "" : "s"}`);
		if (of("VENUE_WITHDRAW").length > 0) parts.push("swept the margin account");
		// The return is the last clause because it is the only one that changed
		// what a depositor can be paid out of. Its absence is said out loud rather
		// than left as a missing clause: a close that sold everything and returned
		// nothing is a close that is not finished.
		if (returned > 0n) parts.push(`returned ${usd(returned)} to the vault`);
		return returned > 0n
			? `${sentence(parts)}.`
			: `${sentence(parts)}, but nothing reached the vault.`;
	}

	// REOPEN. Only reached when a deployment failed part-way — a run that placed
	// the position reports the policy's own reasoning instead, which says more
	// than the rows do. So this describes a half-built position, which is exactly
	// the state worth being precise about.
	const bought = of("SPOT_BUY").reduce((sum, row) => sum + row.notionalAssets, 0n);
	const opened = of("PERP_OPEN");
	const bridged = of("VENUE_DEPOSIT").reduce((sum, row) => sum + row.notionalAssets, 0n);
	if (bought === 0n && opened.length === 0 && bridged === 0n) return NOTHING_HAPPENED.REOPEN;
	const legs: string[] = [];
	if (bridged > 0n) legs.push(`bridged ${usd(bridged)} of margin to the venue`);
	if (opened.length > 0)
		legs.push(`opened the ${opened.map((row) => row.symbol).join(", ")} short`);
	if (bought > 0n) legs.push(`bought ${usd(bought)} of spot`);
	return `${sentence(legs)}.`;
}

/** "a", "a and b", "a, b and c" — with the first letter raised. */
function sentence(parts: string[]): string {
	const joined =
		parts.length <= 1
			? (parts[0] ?? "")
			: `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// ---------------------------------------------------------------------------
// Opening the position back up
// ---------------------------------------------------------------------------

/**
 * Put the vault's capital back to work, now, without waiting for a tick.
 *
 * The decision is the agent's, not a second opinion: this builds the same
 * `VaultSnapshot` a tick builds and hands it to the same `decide`, so what gets
 * deployed, into which market and at what leverage is what the agent would have
 * done on its next tick. Only the *placing* happens here.
 *
 * **It deploys, or it explains.** `decide` weighs a deployment against
 * everything else the vault might need — a redemption to pay, a hedge to
 * correct, margin to restore — and it often answers HOLD for good reasons: not
 * enough idle to clear the minimum, funding that does not pay, a market with no
 * route today. Anything that is not a DEPLOY is reported as the outcome and
 * nothing is placed. Executing whatever the policy happened to prefer would mean
 * a button labelled "re-open" that sometimes sells.
 *
 * **One market per press,** because one action per tick is the agent's design
 * and this borrows it wholesale. A three-market vault is re-opened by pressing
 * three times, each one going into whichever market is furthest below its
 * weight — which is also how the agent would have rebuilt it, one tick at a
 * time.
 *
 * **Deterministic policy only.** The advisor is deliberately not consulted: a
 * language model choosing among permitted actions is a reasonable thing for a
 * tick that runs every minute and a poor thing for a button an operator presses
 * once and watches. `decide` with no advisor returns the policy's own first
 * choice, which is the answer an operator can predict from the numbers in front
 * of them.
 */
async function reopen({ venue, vault, config, log }: StepContext): Promise<StepResult> {
	const now = Math.floor(Date.now() / 1000);

	const state = await vault.read();
	const observation = await venue.observe();
	const queue = await redemptionQueue(config.address, state.pricePerShare);

	const snapshot: VaultSnapshot = {
		address: state.address,
		riskTier: state.riskTier,
		targetLeverageBps: state.targetLeverageBps,
		maxLeverageBps: state.maxLeverageBps,
		freeAssets: state.freeAssets,
		totalAssets: state.totalAssets,
		deployedAssets: state.deployedAssets,
		maxDeployedBps: state.maxDeployedBps,
		withdrawWindowRemaining: await vault.withdrawWindowRemaining(),
		idleOnBase: observation.idleOnBase,
		unallocatedMargin: observation.unallocatedMargin,
		perpNotionalUsdc: observation.valuation.perp.notional,
		perpEquityUsdc: observation.valuation.perp.equity,
		ripeRedeemAssets: sum(queue.filter((q) => q.eligibleAt <= now).map((q) => q.pendingAssets)),
		pendingRedeemAssets: sum(queue.filter((q) => q.eligibleAt > now).map((q) => q.pendingAssets)),
		earliestDeadline: earliestDeadline(queue, now),
		markets: observation.markets.map((market) => ({
			ticker: market.ticker,
			symbol: market.symbol,
			targetWeightBps: market.targetWeightBps,
			spotValueUsdc: market.spotValueUsdc,
			spotUnits: market.spotUnits,
			perpUnits: market.perpUnits,
			fundingShortPercentPerHour: market.fundingShortPercentPerHour,
			// A paused or exiting vault buys nothing, anywhere. The policy reads
			// this per market, and it is what turns "the vault is paused" into a
			// HOLD with a reason rather than a revert half way through a swap.
			spotBuyable: market.spotBuyable && !state.paused && !state.emergencyExit,
			spotSellable: market.spotSellable,
			markPriceUsd: market.markPriceUsd,
			lotSize: market.lotSize,
			minOrderUsd: market.minOrderUsd,
			spotGasUsd: market.spotGasUsd,
			spotImpactPercent: market.spotImpactPercent,
			adl: market.adl,
		})),
		// Both false, and both checked before the step was allowed to start. A
		// standing close order makes the policy answer CLOSE_ALL to everything,
		// which is correct and is why re-opening under one is refused rather than
		// quietly overridden here.
		closeRequested: false,
		rebalanceRequested: false,
		rebalanceDriftBps: config.rebalanceDriftBps,
		venueWithdrawalFeeUsdc: observation.venueWithdrawalFeeUsdc,
		adl: observation.adl,
	};

	const decision = await decide(snapshot, now, null);
	log("info", `the policy answered ${decision.kind} — ${decision.rationale}`);

	if (decision.kind !== "DEPLOY" || !decision.market || !decision.legs) {
		return {
			activity: [],
			detail: `Nothing was deployed. Looking at the vault as it is now, the agent's own policy would ${decision.kind === "HOLD" ? "hold" : `choose ${decision.kind}`} rather than deploy: ${decision.rationale}`,
		};
	}

	// `AGENT` means the capital has already left the vault — a previous
	// deployment drew it down and failed to place it — so drawing again would
	// take a second helping out of the vault to place the first one.
	if (decision.fundedFrom === "VAULT") {
		log("info", `drawing ${usd(decision.amount)} out of the vault.`);
		await vault.agentWithdraw(decision.amount);
	}

	const activity = await venue.deploy({
		...decision.legs,
		market: decision.market,
		// The policy's sizing leverage, not the vault's raw target: the two differ
		// by the margin buffer, and the target would open the hedge at exactly the
		// ceiling its own NAV report is checked against.
		leverageBps: sizingLeverageBps(snapshot),
	});

	return {
		activity,
		detail: `Deployed ${usd(decision.amount)} into ${decision.market} at ${(sizingLeverageBps(snapshot) / 10_000).toFixed(2)}x — ${decision.rationale} Press again to place the next market; the agent deploys one per tick and so does this.`,
	};
}

/**
 * The redemption queue, in the shape the policy reasons about.
 *
 * Read from the indexer, which is the only place it exists — it is chain state
 * the API does not itself index. A failure here is fatal to the step rather than
 * treated as an empty queue, and that is the important part: an empty queue
 * tells the policy nothing is owed, so an indexer that is merely *down* would
 * look exactly like a vault with no redemptions pending and this would happily
 * deploy capital that somebody is waiting to be paid.
 *
 * The queue stores shares; the policy reasons in USDC. The conversion uses the
 * current share price rather than the price when the request was made, which is
 * what the contract does too — it prices an exit at fulfilment.
 */
async function redemptionQueue(address: string, pricePerShare: bigint): Promise<QueueEntry[]> {
	const response = await fetch(`${config.indexerUrl}/queue?vault=${address}`).catch(
		(error: unknown) => {
			throw new AdminError(
				`The redemption queue could not be read from the indexer at ${config.indexerUrl} (${message(error)}), so there is no way to know what this vault owes. Nothing has been deployed.`,
				503,
			);
		},
	);
	if (!response.ok) {
		throw new AdminError(
			`The indexer answered ${response.status} for this vault's redemption queue, so there is no way to know what it owes. Nothing has been deployed.`,
			503,
		);
	}

	const body = (await response.json()) as {
		ripe?: RawQueueRow[];
		waiting?: RawQueueRow[];
	};

	// Ripe and waiting, which together are every open request exactly once.
	// `overdue` is a re-cut of the same rows and adding it would double-count.
	return [...(body.ripe ?? []), ...(body.waiting ?? [])].map((row) => {
		const shares = BigInt(row.pendingShares);
		return {
			controller: row.controller,
			pendingShares: shares,
			pendingAssets: (shares * pricePerShare) / 10n ** 18n,
			eligibleAt: row.eligibleAt,
			fulfillBy: row.fulfillBy,
		};
	});
}

interface RawQueueRow {
	controller: `0x${string}`;
	pendingShares: string;
	eligibleAt: number;
	fulfillBy: number;
}

function sum(values: bigint[]): bigint {
	return values.reduce((total, value) => total + value, 0n);
}

/** The soonest deadline among the ripe requests, or null when none are. */
function earliestDeadline(queue: QueueEntry[], now: number): number | null {
	const ripe = queue.filter((entry) => entry.eligibleAt <= now);
	return ripe.length > 0 ? Math.min(...ripe.map((entry) => entry.fulfillBy)) : null;
}

// ---------------------------------------------------------------------------
// The agent's wiring, borrowed
// ---------------------------------------------------------------------------

/**
 * Build the venue adapter for one vault, exactly as the agent builds it.
 *
 * Built per call rather than cached. `createRelayBridge` reads the unfinished
 * crossings back out of the database as it is constructed, so a bridge started by
 * a process that has since restarted is picked up rather than lost — and a cached
 * adapter would hold a stale market list after an operator edited it.
 */
async function resolveRunner(
	vaultConfig: VaultConfig,
	log: (level: LogLevel, message: string, extra?: unknown) => void = () => {},
): Promise<{ venue: VenueAdapter; vault: VaultClient }> {
	const mpc = clients.nearMpc;
	if (!mpc) {
		throw new AdminError(
			"NEAR chain signatures are not configured on this deployment, so nothing here can sign for an agent wallet. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY.",
			503,
		);
	}

	const feePayerSecret = config.solanaFeePayerSecret;
	if (!feePayerSecret) {
		throw new AdminError(
			"SOLANA_FEE_PAYER_SECRET is not configured, and the agent's Solana wallet holds USDC and no SOL — it cannot pay for its own withdrawal or its own bridge.",
			503,
		);
	}

	if (!vaultConfig.agentPath) {
		throw new AdminError(
			`No derivation path is recorded for ${vaultConfig.address}, so its agent wallet cannot be signed for.`,
			409,
		);
	}

	const chain = resolveAgentChain();
	const transport = http(chain.rpcUrls.default.http[0]);
	const publicClient = createPublicClient({ chain, transport });

	/**
	 * The agent address the *vault* names, not the one the database records.
	 *
	 * The path is the only thing that decides which wallet signs, and a wrong one
	 * derives a real, valid, entirely unrelated wallet rather than failing. So it
	 * is checked against the immutable address in the vault's own constructor —
	 * the one piece of this that no database row can be wrong about — and
	 * `agentWalletFor` throws on a mismatch before anything is signed.
	 */
	const agentWallet = (await publicClient.readContract({
		abi: lemonVaultAbi,
		address: vaultConfig.address as Address,
		functionName: "agentWallet",
	})) as Address;

	const wallet = agentWalletFor(mpc, vaultConfig.agentPath, agentWallet);
	const walletClient = createWalletClient({ account: wallet.account, chain, transport });
	const vault = new VaultClient(publicClient, walletClient, vaultConfig.address as Address);
	const solana = createSolanaExecutor({
		rpcUrl: config.solanaRpcUrl,
		feePayerSecret,
		mpc,
	});

	// Shaped the way the indexer serves it, because that is what `resolveVenue`
	// takes. Only the fields it reads are meaningful here — and none of the ones
	// it reads come from the chain, so this needs no indexer to be working.
	const indexed: IndexedVault = {
		address: vaultConfig.address as `0x${string}`,
		chainId: vaultConfig.chainId,
		ticker: vaultConfig.ticker,
		symbol: vaultConfig.spotTokenSymbol,
		riskTier: 0,
		paused: false,
		agentWallet,
		agentPath: vaultConfig.agentPath,
		agentEnabled: vaultConfig.agentEnabled,
	};

	const resolved = await resolveVenue({
		indexed,
		vault,
		wallet,
		walletClient,
		publicClient: publicClient as PublicClient,
		solana,
		log,
	});

	if (!resolved) {
		throw new AdminError(
			`${vaultConfig.address} has no venue this process can trade — no market configured, or no market whose spot token is a curated ${AGENT_CHAIN.name} token.`,
			409,
		);
	}

	return { venue: resolved.venue, vault };
}

/**
 * Refuse a vault this process cannot sign for on the right chain.
 *
 * `AGENT_CHAIN_ID` selects the chain for everything borrowed from the agent —
 * the RPC, the USDC address, the token registry, the bridge's origin — and it is
 * one chain per process by construction. Left unchecked, an X Layer vault
 * resolved against Base would not fail cleanly: it would find no market whose
 * spot token is curated here and report "nothing to trade", which reads as a
 * broken vault rather than as an API container pointed at another chain.
 */
function assertOnThisChain(vaultConfig: VaultConfig): void {
	if (vaultConfig.chainId === AGENT_CHAIN.id) return;

	throw new AdminError(
		`${vaultConfig.ticker} custodies on chain ${vaultConfig.chainId}, and this API process is wired to ${AGENT_CHAIN.name} (${AGENT_CHAIN.id}). Hand-run steps sign on one chain only — run them from an API process started with AGENT_CHAIN_ID=${vaultConfig.chainId}.`,
		409,
	);
}

/**
 * Give back a lock whose holder has stopped breathing.
 *
 * These steps run in memory and are not resumed, so a row left RUNNING by a
 * restarted process would otherwise hold its vault's lock forever. Marked
 * ABANDONED rather than FAILED: the venue calls it made still stand, and the
 * position is the answer to what actually happened.
 */
async function releaseStale(chainId: number, address: string): Promise<void> {
	const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);

	const { count } = await prisma.operatorAction.updateMany({
		where: {
			chainId,
			vaultAddress: address,
			status: "RUNNING",
			heartbeatAt: { lt: cutoff },
		},
		data: {
			status: "ABANDONED",
			finishedAt: new Date(),
			runningKey: null,
			error:
				"The process running this step stopped reporting, so the record was abandoned. Whatever venue calls it had already made stand — read the position before running it again.",
		},
	});

	if (count > 0) {
		logger.emit("warn", `Released ${count} stale operator lock(s) on ${address}.`);
	}
}

function runningKey(chainId: number, address: string): string {
	return `${chainId}:${address}`;
}

/** Prisma's unique-constraint failure, without importing its error classes. */
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
	);
}

/** USDC base units as a human reads them. */
function usd(amount: bigint): string {
	return `$${(Number(amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
