import { AGENT_CHAIN, resolveAgentChain } from "@lemon/agent/chain";
import { type IndexedVault, resolveVenue } from "@lemon/agent/runtime";
import { createSolanaExecutor } from "@lemon/agent/solana";
import { type ActivityInput, VaultClient } from "@lemon/agent/vault";
import { agentWalletFor } from "@lemon/agent/wallet";
import type { VenueAdapter } from "@lemon/agent/worker";
import { VenueExecutionError } from "@lemon/agent/worker";
import { lemonVaultAbi } from "@lemon/contracts";
import { createLogger, type LogLevel } from "@lemon/core";
import { type OperatorAction, prisma, type VaultConfig } from "@lemon/db";
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
 * Closing a vault's position by hand.
 *
 * The close order an operator gives on the dashboard is an *instruction*: it is
 * written to `VaultConfig`, the agent reads it on its next tick, and the agent
 * does the work in one all-or-nothing call. That is the right shape when the
 * agent is healthy. It is no use at all in the situations an operator actually
 * reaches for it:
 *
 *  - The agent is stopped, or is on a build that predates a fix the position
 *    needs, and redeploying it is a slow answer to money that is exposed now.
 *  - A close got most of the way through and failed. The remainder needs the
 *    perp closed and the margin brought home — not another attempt at selling
 *    spot that has already been sold.
 *  - The capital should come home but the position should not be re-opened by a
 *    tick five minutes later.
 *
 * So this runs the four steps of a close directly, from the API process, using
 * the agent's own wiring: `resolveVenue` builds the identical adapter against
 * the identical market list, so the token a hand-run step sells is the token the
 * agent would have sold. Nothing here re-implements a venue call.
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

/** The four steps, in the order an unwind takes them. */
export const OPERATOR_STEPS = [
	"CLOSE_SPOT",
	"CLOSE_PERP",
	"BRIDGE_HOME",
	"RETURN_TO_VAULT",
] as const;

export type OperatorStep = (typeof OPERATOR_STEPS)[number];

/**
 * Which adapter method each step runs. One mapping, so nothing can drift.
 *
 * Typed to the four step methods rather than to `keyof VenueAdapter`, because
 * the adapter's other methods take arguments and answer with other shapes —
 * widening this would make `venue[method]()` a call the compiler cannot check.
 */
const STEP_METHOD: Record<OperatorStep, "closeSpot" | "closePerp" | "bridgeHome" | "returnIdle"> = {
	CLOSE_SPOT: "closeSpot",
	CLOSE_PERP: "closePerp",
	BRIDGE_HOME: "bridgeHome",
	RETURN_TO_VAULT: "returnIdle",
};

/**
 * What a step does, in the operator's own words, for a row that has none.
 *
 * Used when a step finished having moved nothing — which is a real and common
 * outcome, not a failure: a vault whose spot is already sold runs `CLOSE_SPOT`
 * to completion and finds nothing to sell.
 */
const NOTHING_HAPPENED: Record<OperatorStep, string> = {
	CLOSE_SPOT: "No spot was held, so nothing was sold.",
	CLOSE_PERP: "No short was open, so nothing was closed.",
	BRIDGE_HOME: "The venue had no free margin and the Solana wallet was empty, so nothing crossed.",
	RETURN_TO_VAULT: "The agent held no USDC, so nothing was returned.",
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
		const activity = await runner.venue[STEP_METHOD[action.step as OperatorStep]]();
		const reported = await publish(runner.vault, activity, log);

		await finish(action.id, {
			status: "DONE",
			detail: describeStep(action.step as OperatorStep, activity),
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

	const returns = of("BRIDGE_IN");
	if (returns.length === 0) return NOTHING_HAPPENED.RETURN_TO_VAULT;
	const returned = returns.reduce((sum, row) => sum + row.notionalAssets, 0n);
	return `Returned ${usd(returned)} to the vault. It is free assets now, and redemptions can be paid out of it.`;
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
