import { describe, expect, it, mock } from "bun:test";
import { ValuationError } from "../src/valuation";
import type { ActivityInput } from "../src/vault";
import { type QueueEntry, tick, type VenueAdapter, type WorkerDeps } from "../src/worker";

const USDC = 1_000_000n;
const NOW = 1_800_000_000;
const VAULT = "0x0000000000000000000000000000000000000001" as const;

function vaultState(overrides = {}) {
	return {
		address: VAULT,
		totalAssets: 10_000n * USDC,
		freeAssets: 10_000n * USDC,
		deployedAssets: 0n,
		claimableAssets: 0n,
		totalSupply: 10_000n * 10n ** 18n,
		pricePerShare: USDC,
		riskTier: "CONSERVATIVE" as const,
		targetLeverageBps: 10_000,
		maxLeverageBps: 10_000,
		maxDeployedBps: 9000,
		minNavReportInterval: 900,
		maxNavStaleness: 21_600,
		lastNavReportAt: NOW - 3600,
		paused: false,
		emergencyExit: false,
		navIsStale: false,
		...overrides,
	};
}

function observation(overrides = {}) {
	return {
		valuation: {
			deployedAssets: 0n,
			leverageBps: 10_000,
			components: { spot: 0n, perpEquity: 0n, idleAtAgent: 0n, inFlight: 0n },
		},
		spotUnits: 0n,
		perpUnits: 0n,
		fundingShortPercentPerHour: 0.002,
		spotBuyable: true,
		spotSellable: true,
		symbol: "NVDA",
		...overrides,
	};
}

function harness(options: {
	state?: ReturnType<typeof vaultState>;
	observe?: () => Promise<ReturnType<typeof observation>>;
	queue?: QueueEntry[];
	venue?: Partial<VenueAdapter>;
}) {
	const calls: string[] = [];
	let state = options.state ?? vaultState();

	const vault = {
		address: VAULT,
		read: async () => state,
		withdrawWindowRemaining: async () => 500_000n * USDC,
		agentWithdraw: mock(async (amount: bigint) => {
			calls.push(`agentWithdraw:${amount}`);
			state = { ...state, freeAssets: state.freeAssets - amount, deployedAssets: amount };
			return "0xtx" as const;
		}),
		agentReturn: mock(async () => "0xtx" as const),
		reportNav: mock(async () => {
			calls.push("reportNav");
			return "0xtx" as const;
		}),
		fulfillRedeem: mock(async (controller: string, shares: bigint) => {
			calls.push(`fulfillRedeem:${controller}:${shares}`);
			return "0xtx" as const;
		}),
		reportActivity: mock(async (entries: ActivityInput[]) => {
			calls.push(`reportActivity:${entries.length}`);
			return "0xtx" as const;
		}),
		// biome-ignore lint/suspicious/noExplicitAny: test double.
	} as any;

	const venue: VenueAdapter = {
		observe: options.observe ?? (async () => observation()),
		deploy: options.venue?.deploy ?? (async () => [activityRow()]),
		unwind: options.venue?.unwind ?? (async () => [activityRow()]),
		rebalance: options.venue?.rebalance ?? (async () => [activityRow()]),
	};

	const deps: WorkerDeps = {
		vault,
		venue,
		advisor: null,
		queue: async () => options.queue ?? [],
		now: () => NOW,
		log: () => undefined,
	};

	return { deps, vault, calls };
}

function activityRow(): ActivityInput {
	return {
		kind: "SPOT_BUY",
		chain: "BASE",
		symbol: "NVDA",
		baseAmount: 1n,
		notionalAssets: USDC,
		pnlAssets: 0n,
		feeAssets: 0n,
		txRef: "0xdeadbeef",
		occurredAt: NOW,
	};
}

function queueEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
	return {
		controller: "0x00000000000000000000000000000000000000aa",
		pendingShares: 1_000n * 10n ** 18n,
		pendingAssets: 1_000n * USDC,
		eligibleAt: NOW - 60,
		fulfillBy: NOW + 4 * 86_400,
		...overrides,
	};
}

describe("tick", () => {
	/**
	 * Report before trade, always. A stale NAV blocks deposits and fulfilments
	 * on-chain, so an agent that traded first would hold its own vault shut for
	 * the length of every trade.
	 */
	it("reports NAV before it acts", async () => {
		const { deps, calls } = harness({});
		await tick(deps);
		expect(calls[0]).toBe("reportNav");
		expect(calls).toContain("agentWithdraw:9000000000");
	});

	it("skips the report when one is not yet due", async () => {
		const { deps, vault } = harness({ state: vaultState({ lastNavReportAt: NOW - 60 }) });
		const result = await tick(deps);
		expect(vault.reportNav).not.toHaveBeenCalled();
		expect(result.navReported).toBe(false);
	});

	it("deploys idle capital and publishes what it did", async () => {
		const { deps, calls } = harness({});
		const result = await tick(deps);
		expect(result.action).toBe("DEPLOY");
		expect(calls).toContain("reportActivity:1");
	});

	// -- refusing to price -------------------------------------------------

	/**
	 * The most important refusal in the agent. Reporting a NAV that omits an
	 * unpriceable leg would mark every holder down by its full value.
	 */
	it("reports nothing at all when the position cannot be priced", async () => {
		const { deps, vault } = harness({
			observe: async () => {
				throw new ValuationError("spot leg has no route");
			},
		});
		const result = await tick(deps);
		expect(vault.reportNav).not.toHaveBeenCalled();
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(result.action).toBe("NONE");
		expect(result.error).toContain("no route");
	});

	/** A rejected report means the contract does not believe the position. */
	it("does not trade after a rejected NAV report", async () => {
		const { deps, vault } = harness({});
		vault.reportNav = mock(async () => {
			throw new Error("NavDeviationTooLarge");
		});
		const result = await tick(deps);
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(result.action).toBe("NONE");
		expect(result.error).toContain("NavDeviationTooLarge");
	});

	// -- the queue ---------------------------------------------------------

	it("fulfils a ripe redemption the vault can cover", async () => {
		const { deps, calls } = harness({
			state: vaultState({ freeAssets: 2_000n * USDC, deployedAssets: 8_000n * USDC }),
			queue: [queueEntry()],
		});
		await tick(deps);
		expect(calls.some((c) => c.startsWith("fulfillRedeem:"))).toBe(true);
	});

	/**
	 * A partial pass beats an all-or-nothing attempt. Three of five paid today is
	 * a better outcome than nobody paid because the fifth was a dollar short.
	 */
	it("scales a fulfilment down to what the vault can actually pay", async () => {
		const { deps, calls } = harness({
			state: vaultState({ freeAssets: 500n * USDC, deployedAssets: 9_500n * USDC }),
			queue: [queueEntry({ pendingShares: 1_000n * 10n ** 18n, pendingAssets: 1_000n * USDC })],
		});
		await tick(deps);
		const call = calls.find((c) => c.startsWith("fulfillRedeem:"));
		// Half the assets available, so half the shares.
		expect(call).toContain((500n * 10n ** 18n).toString());
	});

	it("unwinds when the queue is short of liquidity", async () => {
		const { deps } = harness({
			state: vaultState({ freeAssets: 0n, deployedAssets: 10_000n * USDC }),
			queue: [queueEntry({ pendingAssets: 3_000n * USDC })],
		});
		const result = await tick(deps);
		expect(result.action).toBe("UNWIND");
	});

	it("does not touch requests still inside the delay window", async () => {
		const { deps, calls } = harness({
			queue: [queueEntry({ eligibleAt: NOW + 86_400 })],
		});
		await tick(deps);
		expect(calls.some((c) => c.startsWith("fulfillRedeem:"))).toBe(false);
	});

	// -- partial failure ---------------------------------------------------

	/**
	 * A deployment that bought spot and failed to open the short is precisely
	 * the state a depositor most needs to see. Swallowing it because the action
	 * as a whole failed would hide the only half that moved their money.
	 */
	it("publishes the legs that landed even when the action failed", async () => {
		const { deps } = harness({
			venue: {
				deploy: async () => {
					throw new Error("perp leg rejected");
				},
			},
		});
		const result = await tick(deps);
		expect(result.error).toContain("perp leg rejected");
		expect(result.navReported).toBe(true);
	});

	/** The trades already happened; losing the audit row must not skip the queue. */
	it("survives a failed activity report", async () => {
		const { deps, vault } = harness({
			state: vaultState({ freeAssets: 2_000n * USDC, deployedAssets: 8_000n * USDC }),
			queue: [queueEntry()],
		});
		vault.reportActivity = mock(async () => {
			throw new Error("report reverted");
		});
		const result = await tick(deps);
		expect(result.fulfilled).toBe(1);
	});

	// -- guards ------------------------------------------------------------

	it("does not deploy while the vault is paused", async () => {
		const { deps, vault } = harness({ state: vaultState({ paused: true }) });
		const result = await tick(deps);
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(result.action).toBe("HOLD");
	});

	it("does not deploy during an emergency exit", async () => {
		const { deps, vault } = harness({ state: vaultState({ emergencyExit: true }) });
		await tick(deps);
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
	});
});
