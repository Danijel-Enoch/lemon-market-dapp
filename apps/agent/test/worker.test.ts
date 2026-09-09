import { describe, expect, it, mock } from "bun:test";
import { lemonVaultAbi } from "@lemon/contracts";
import { adlRisk } from "@lemon/core";
import { type Abi, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { sizingLeverageBps } from "../src/policy";
import { ValuationError } from "../src/valuation";
import type { ActivityInput } from "../src/vault";
import {
	type MarketObservation,
	type QueueEntry,
	tick,
	type VenueAdapter,
	VenueExecutionError,
	type WorkerDeps,
} from "../src/worker";

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

// Flat by default — entry equals mark, so the short is out of the queue.
const CALM_ADL = adlRisk({
	side: "short",
	entryPrice: 100,
	markPrice: 100,
	size: 10,
	equityUsd: 1000,
});

function observedMarket(overrides: Partial<MarketObservation> = {}): MarketObservation {
	return {
		ticker: "NVDA",
		symbol: "NVDAc",
		perpSymbol: "NVDA",
		targetWeightBps: 10_000,
		spotValueUsdc: 0n,
		spotUnits: 0n,
		perpUnits: 0n,
		fundingShortPercentPerHour: 0.002,
		spotBuyable: true,
		spotSellable: true,
		markPriceUsd: 100,
		lotSize: 0.001,
		minOrderUsd: 10,
		spotGasUsd: 0.01,
		spotImpactPercent: 0.01,
		adl: CALM_ADL,
		...overrides,
	};
}

function observation(overrides = {}) {
	return {
		valuation: {
			deployedAssets: 0n,
			leverageBps: 10_000,
			components: { spot: 0n, perpEquity: 0n, idleAtAgent: 0n, inFlight: 0n },
			perp: { notional: 0n, equity: 0n },
			spotByMarket: {},
		},
		markets: [observedMarket()],
		adl: CALM_ADL,
		idleOnBase: 0n,
		unallocatedMargin: 0n,
		venueWithdrawalFeeUsdc: 0n,
		...overrides,
	};
}

/**
 * An observation whose perp account reads at a given leverage.
 *
 * `observation` spreads its overrides at the top level, so the two figures the
 * mandate is judged on — which live inside the valuation — cannot be set through
 * it without replacing the whole valuation. This does that.
 */
function atLeverage(observedBps: number, notional = 1_000n * USDC, overrides = {}) {
	const equity = (notional * 10_000n) / BigInt(observedBps);
	return observation({
		valuation: {
			deployedAssets: notional + equity,
			leverageBps: observedBps,
			components: { spot: notional, perpEquity: equity, idleAtAgent: 0n, inFlight: 0n },
			perp: { notional, equity },
			spotByMarket: { NVDA: notional },
		},
		...overrides,
	});
}

function harness(options: {
	state?: ReturnType<typeof vaultState>;
	observe?: () => Promise<ReturnType<typeof observation>>;
	queue?: QueueEntry[];
	venue?: Partial<VenueAdapter>;
	closeRequested?: boolean;
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
		deploy:
			options.venue?.deploy ??
			mock(async ({ market }: { market: string }) => {
				calls.push(`deploy:${market}`);
				return [activityRow()];
			}),
		unwind:
			options.venue?.unwind ??
			mock(async ({ amount }: { amount: bigint }) => {
				calls.push(`unwind:${amount}`);
				return [activityRow()];
			}),
		rebalance:
			options.venue?.rebalance ??
			mock(async ({ market, targetUnits }: { market: string; targetUnits: bigint }) => {
				calls.push(`rebalance:${market}:${targetUnits}`);
				return [activityRow()];
			}),
		topUpMargin:
			options.venue?.topUpMargin ??
			mock(async ({ amount }: { amount: bigint }) => {
				calls.push(`topUpMargin:${amount}`);
				return [activityRow()];
			}),
		closeAll:
			options.venue?.closeAll ??
			mock(async () => {
				calls.push("closeAll");
				return [activityRow()];
			}),
	};

	const logs: string[] = [];
	const deps: WorkerDeps = {
		vault,
		venue,
		advisor: null,
		queue: async () => options.queue ?? [],
		closeRequested: options.closeRequested ?? false,
		rebalanceDriftBps: 100,
		now: () => NOW,
		log: (level, message) => {
			logs.push(`${level}:${message}`);
		},
	};

	return { deps, vault, venue, calls, logs };
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

/**
 * A real `LeverageExceedsMandate` revert, as viem hands one to the agent.
 *
 * Built through `encodeErrorResult` and viem's own error type rather than as a
 * bare `Error` with the right words in it, because `isRevert` decodes the custom
 * error out of the revert data against the ABI. A string double would pass a
 * test the production path could not.
 */
function leverageRevert(observed: number, ceiling: number) {
	return new ContractFunctionRevertedError({
		abi: lemonVaultAbi as Abi,
		functionName: "reportNav",
		data: encodeErrorResult({
			abi: lemonVaultAbi as Abi,
			errorName: "LeverageExceedsMandate",
			args: [observed, ceiling],
		}),
	});
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

	/**
	 * The half of the stranded-capital fix that moves money. A deployment funded
	 * from the agent's own balance must not call `agentWithdraw` — the capital was
	 * withdrawn once already by the deployment that failed, and drawing again
	 * would take a second helping out of the vault to place the first one.
	 */
	it("deploys capital stranded at the agent without drawing more down", async () => {
		const stranded = 4_000n * USDC;
		const { deps, vault, calls } = harness({
			state: vaultState({
				totalAssets: stranded,
				freeAssets: 0n,
				deployedAssets: stranded,
			}),
			observe: async () => observation({ idleOnBase: stranded }),
		});

		const result = await tick(deps);

		expect(result.action).toBe("DEPLOY");
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(calls).toContain("deploy:NVDA");
	});

	/**
	 * The legs reach the venue as the policy sized them. This is the step that was
	 * halving them: the worker used to recompute `spot + margin` from the total,
	 * which would have bridged margin to a venue that already had unhedged margin
	 * sitting on it and left the spot leg unbought for another tick.
	 */
	it("passes a spot-only deployment through without re-splitting it", async () => {
		const margin = 3_000n * USDC;
		const idle = 4_000n * USDC;
		const deploy = mock(async (_: Parameters<VenueAdapter["deploy"]>[0]) => [activityRow()]);

		const { deps, vault } = harness({
			state: vaultState({
				totalAssets: idle + margin,
				freeAssets: 0n,
				deployedAssets: idle + margin,
			}),
			observe: async () => observation({ idleOnBase: idle, unallocatedMargin: margin }),
			venue: { deploy },
		});

		await tick(deps);

		// Spot sized to what the waiting margin carries at the sizing leverage —
		// slightly under the margin itself, since an unlevered hedge is backed by a
		// little more than its own notional — and nothing bridged.
		const sizing = sizingLeverageBps({ targetLeverageBps: 10_000, maxLeverageBps: 10_000 });
		expect(deploy.mock.calls[0]?.[0]).toMatchObject({
			spotNotional: (margin * BigInt(sizing)) / 10_000n,
			perpMargin: 0n,
			leverageBps: sizing,
		});
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
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

	/**
	 * A deviation rejection means the contract does not believe the position.
	 * Trading on top of a valuation the chain has just refused is the last thing
	 * to do about it, so the tick stops.
	 */
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

	/**
	 * A mandate rejection is the opposite case, and the loop it used to cause is
	 * what this is here for.
	 *
	 * The contract believes the valuation and objects to the leverage. That is a
	 * thing the agent can fix — but the fix is an action, and the action stage is
	 * below the report. Returning here left the agent posting the same rejected
	 * report every tick with no way to reach the cure, while the NAV went stale
	 * and the vault stopped taking deposits and paying redemptions. Observed as
	 * `LeverageExceedsMandate(10025, 10000)` every 64 seconds.
	 */
	it("carries on after a report rejected for leverage, so it can act on it", async () => {
		const breached = 10_025;
		const notional = 1_000n * USDC;
		const { deps, vault, calls } = harness({
			observe: async () => atLeverage(breached, notional),
		});
		vault.reportNav = mock(async () => {
			throw leverageRevert(breached, 10_000);
		});

		const result = await tick(deps);

		// The report did not land, and the tick says so — but it reached the stage
		// that can do something about it.
		expect(result.navReported).toBe(false);
		expect(result.action).toBe("TOP_UP_MARGIN");
		expect(calls.some((c) => c.startsWith("topUpMargin:"))).toBe(true);
	});

	/**
	 * The discrimination is on the decoded custom error, not on the words in the
	 * message. A deviation rejection built the same way still stops the tick.
	 */
	it("still stops for a rejection that is not about the mandate", async () => {
		const { deps, vault } = harness({});
		vault.reportNav = mock(async () => {
			throw new ContractFunctionRevertedError({
				abi: lemonVaultAbi as Abi,
				functionName: "reportNav",
				data: encodeErrorResult({
					abi: lemonVaultAbi as Abi,
					errorName: "NavDeviationTooLarge",
					args: [1n, 0n],
				}),
			});
		});

		const result = await tick(deps);

		expect(result.action).toBe("NONE");
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
	});

	// -- restoring the margin buffer ---------------------------------------

	/** A top-up drawn from the vault moves capital across the vault's boundary. */
	it("draws a vault-funded top-up down before bridging it", async () => {
		const notional = 1_000n * USDC;
		const { deps, calls } = harness({
			observe: async () => atLeverage(10_000, notional),
		});

		const result = await tick(deps);

		expect(result.action).toBe("TOP_UP_MARGIN");
		const drawn = calls.find((c) => c.startsWith("agentWithdraw:"));
		const bridged = calls.find((c) => c.startsWith("topUpMargin:"));
		expect(drawn).toBeDefined();
		// The same amount, and the draw comes first — bridging money that has not
		// left the vault yet would send USDC the agent does not hold.
		expect(drawn?.split(":")[1]).toBe(bridged?.split(":")[1]);
		expect(calls.indexOf(drawn as string)).toBeLessThan(calls.indexOf(bridged as string));
	});

	/**
	 * The mirror of the deployment rule. Capital already stranded at the agent has
	 * been withdrawn once; drawing again would take a second helping from the
	 * vault to do one transfer.
	 */
	it("spends stranded capital on a top-up without drawing more down", async () => {
		const notional = 1_000n * USDC;
		const stranded = 500n * USDC;
		const { deps, vault, calls } = harness({
			state: vaultState({
				totalAssets: 2_000n * USDC,
				freeAssets: 0n,
				deployedAssets: 2_000n * USDC,
			}),
			observe: async () => atLeverage(10_000, notional, { idleOnBase: stranded }),
		});

		const result = await tick(deps);

		expect(result.action).toBe("TOP_UP_MARGIN");
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(calls.some((c) => c.startsWith("topUpMargin:"))).toBe(true);
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
			// The unwind is sized against what can actually be sold, so the leg has
			// to be worth something for there to be anything to sell.
			observe: async () =>
				observation({ markets: [observedMarket({ spotValueUsdc: 10_000n * USDC })] }),
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

/**
 * A vault nobody has deposited into has nothing to say, and saying it every
 * minute costs venue quotes, gas and a run history that buries the vaults that
 * are actually running.
 */
describe("tick, on an empty vault", () => {
	function empty(overrides = {}) {
		return vaultState({
			totalAssets: 0n,
			freeAssets: 0n,
			deployedAssets: 0n,
			claimableAssets: 0n,
			totalSupply: 0n,
			...overrides,
		});
	}

	it("does not read the venues, report, or trade", async () => {
		const observe = mock(async () => observation());
		const { deps, vault } = harness({ state: empty(), observe });

		const result = await tick(deps);

		expect(observe).not.toHaveBeenCalled();
		expect(vault.reportNav).not.toHaveBeenCalled();
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(vault.reportActivity).not.toHaveBeenCalled();
		expect(result.action).toBe("IDLE");
		expect(result.navReported).toBe(false);
		expect(result.activityReported).toBe(0);
		expect(result.error).toBeUndefined();
	});

	/**
	 * The one thing it still owes the vault. `maxDeposit` is zero while the NAV
	 * is stale, so an agent that went silent here would close the vault against
	 * the first depositor it is waiting for.
	 */
	it("posts a keepalive NAV once the staleness window is half gone", async () => {
		// Half of 21_600s, so a report at 12_000s ago is overdue.
		const { deps, vault } = harness({ state: empty({ lastNavReportAt: NOW - 12_000 }) });

		const result = await tick(deps);

		expect(vault.reportNav).toHaveBeenCalledWith(0n, 10_000, NOW);
		expect(result.navReported).toBe(true);
		expect(result.action).toBe("IDLE");
	});

	it("keeps the keepalive behind the contract's own report interval", async () => {
		// A short staleness window: half of it falls inside the interval a report
		// sooner than which the contract reverts, so the interval wins.
		const { deps, vault } = harness({
			state: empty({
				minNavReportInterval: 2400,
				maxNavStaleness: 3600,
				lastNavReportAt: NOW - 2000,
			}),
		});

		await tick(deps);

		expect(vault.reportNav).not.toHaveBeenCalled();
	});

	it("records a rejected keepalive, because the vault is about to go stale", async () => {
		const { deps, vault } = harness({ state: empty({ lastNavReportAt: NOW - 12_000 }) });
		vault.reportNav = mock(async () => {
			throw new Error("NavReportTooSoon");
		});

		const result = await tick(deps);

		expect(result.navReported).toBe(false);
		expect(result.error).toContain("NavReportTooSoon");
	});

	// -- what still counts as occupied -------------------------------------

	it("runs the full tick for a share that survived a redemption", async () => {
		const observe = mock(async () => observation());
		const { deps } = harness({ state: empty({ totalSupply: 10n ** 18n }), observe });

		const result = await tick(deps);

		expect(observe).toHaveBeenCalled();
		expect(result.action).not.toBe("IDLE");
	});

	it("runs the full tick while capital is still out at the venue", async () => {
		const observe = mock(async () => observation());
		const { deps } = harness({
			state: empty({ totalAssets: 5_000n * USDC, deployedAssets: 5_000n * USDC }),
			observe,
		});

		await tick(deps);

		expect(observe).toHaveBeenCalled();
	});

	it("runs the full tick while a claim is waiting to be collected", async () => {
		const observe = mock(async () => observation());
		const { deps } = harness({ state: empty({ claimableAssets: 100n * USDC }), observe });

		await tick(deps);

		expect(observe).toHaveBeenCalled();
	});

	/** Nothing deployed, nothing owed, nothing held: flat by every measure. */
	it("satisfies a close order without observing anything", async () => {
		const { deps } = harness({ state: empty(), closeRequested: true });

		const result = await tick(deps);

		expect(result.action).toBe("IDLE");
		expect(result.closeSatisfied).toBe(true);
	});
});

describe("auto-deleveraging awareness", () => {
	it("says nothing while the short is losing, which is most of the time", async () => {
		const h = harness({
			observe: async () =>
				observation({
					// Mark above entry: the short is down, so it is not in the queue.
					adl: adlRisk({
						side: "short",
						entryPrice: 100,
						markPrice: 110,
						size: 10,
						equityUsd: 300,
					}),
				}),
		});
		await tick(h.deps);
		expect(h.logs.filter((l) => l.includes("auto-deleveraging"))).toHaveLength(0);
	});

	it("warns once the short is far enough up the queue to be reached", async () => {
		const h = harness({
			observe: async () =>
				observation({
					// Mark 12% below entry at 3x: winning, and well into the queue.
					adl: adlRisk({ side: "short", entryPrice: 100, markPrice: 88, size: 10, equityUsd: 300 }),
				}),
		});
		await tick(h.deps);
		const warned = h.logs.filter((l) => l.includes("auto-deleveraging"));
		expect(warned).toHaveLength(1);
		expect(warned[0]).toContain("in profit");
	});
});

describe("tick, across several markets", () => {
	const twoMarkets = [
		observedMarket({ ticker: "BTC", symbol: "cbBTC", perpSymbol: "BTC", targetWeightBps: 5_000 }),
		observedMarket({ ticker: "ETH", symbol: "WETH", perpSymbol: "ETH", targetWeightBps: 5_000 }),
	];

	it("tells the venue which market a deployment is for", async () => {
		const { deps, calls } = harness({
			observe: async () => observation({ markets: twoMarkets }),
		});
		const result = await tick(deps);
		expect(result.action).toBe("DEPLOY");
		expect(result.market).toBeTruthy();
		expect(calls).toContain(`deploy:${result.market}`);
	});

	/**
	 * A rebalance names a market *and* the unit target for that market's spot
	 * leg. Handing over the wrong market's target would trade one hedge to the
	 * size of another, which is the failure the per-market lookup exists to stop.
	 */
	it("rebalances against the named market's own spot leg", async () => {
		const markets = [
			observedMarket({
				ticker: "BTC",
				targetWeightBps: 5_000,
				spotUnits: 7n * 10n ** 18n,
				perpUnits: 7n * 10n ** 18n,
			}),
			observedMarket({
				ticker: "ETH",
				targetWeightBps: 5_000,
				spotUnits: 100n * 10n ** 18n,
				perpUnits: 90n * 10n ** 18n,
			}),
		];
		const { deps, calls } = harness({
			state: vaultState({ freeAssets: 0n, deployedAssets: 9_000n * USDC }),
			observe: async () => observation({ markets }),
		});
		const result = await tick(deps);
		expect(result.action).toBe("REBALANCE");
		expect(result.market).toBe("ETH");
		expect(calls).toContain(`rebalance:ETH:${100n * 10n ** 18n}`);
	});

	it("refuses to deploy without a market rather than guessing one", async () => {
		const { deps, vault } = harness({
			observe: async () => observation({ markets: [] }),
		});
		// An empty market list is not something the adapter produces, so this is
		// really a check that the worker fails before `agentWithdraw` rather than
		// after it — capital stays in the vault when there is nothing to do with it.
		const result = await tick(deps);
		expect(result.action).not.toBe("DEPLOY");
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
	});
});

describe("tick, under a close order", () => {
	it("closes everything and does not deploy", async () => {
		const { deps, calls, vault } = harness({
			closeRequested: true,
			state: vaultState({ freeAssets: 10_000n * USDC, deployedAssets: 5_000n * USDC }),
			observe: async () => observation({ markets: [observedMarket({ spotUnits: 10n ** 18n })] }),
		});
		const result = await tick(deps);
		expect(result.action).toBe("CLOSE_ALL");
		expect(calls).toContain("closeAll");
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
	});

	/**
	 * The order is standing. Once the position is flat the agent keeps reporting
	 * NAV and settling the queue — stopping either would stale the vault and block
	 * the very withdrawals an operator usually closes a vault to serve — but it
	 * never puts capital back to work.
	 */
	it("keeps reporting and settling once flat, without redeploying", async () => {
		const { deps, calls, vault } = harness({
			closeRequested: true,
			state: vaultState({ freeAssets: 10_000n * USDC, deployedAssets: 0n }),
			queue: [queueEntry()],
		});
		const result = await tick(deps);
		expect(result.action).toBe("HOLD");
		expect(vault.reportNav).toHaveBeenCalled();
		expect(vault.agentWithdraw).not.toHaveBeenCalled();
		expect(calls.some((c) => c.startsWith("fulfillRedeem:"))).toBe(true);
	});

	/**
	 * Reported on the tick that *observes* the vault flat, not the one that
	 * closes it. The legs have to be seen empty and the NAV reported at zero
	 * before the position is flat by any measure a depositor could check.
	 */
	it("reports the order satisfied only once the position is observably flat", async () => {
		const closing = harness({
			closeRequested: true,
			state: vaultState({ freeAssets: 0n, deployedAssets: 5_000n * USDC }),
			observe: async () => observation({ markets: [observedMarket({ spotUnits: 10n ** 18n })] }),
		});
		expect((await tick(closing.deps)).closeSatisfied).toBe(false);

		const settled = harness({
			closeRequested: true,
			state: vaultState({ freeAssets: 10_000n * USDC, deployedAssets: 0n }),
		});
		expect((await tick(settled.deps)).closeSatisfied).toBe(true);
	});

	it("does not report a close satisfied when no order stands", async () => {
		const { deps } = harness({ state: vaultState({ deployedAssets: 0n }) });
		expect((await tick(deps)).closeSatisfied).toBe(false);
	});

	/**
	 * A close that gets most of the way there has not served its purpose. The
	 * legs that did land are still published, the order stays outstanding, and
	 * the next tick tries the remainder.
	 */
	it("publishes what it closed when part of the close fails", async () => {
		const { deps, calls } = harness({
			closeRequested: true,
			state: vaultState({ freeAssets: 0n, deployedAssets: 5_000n * USDC }),
			observe: async () => observation({ markets: [observedMarket({ spotUnits: 10n ** 18n })] }),
			venue: {
				closeAll: async () => {
					throw new VenueExecutionError("NVDA has no route", [activityRow()]);
				},
			},
		});
		const result = await tick(deps);
		expect(result.action).toBe("CLOSE_ALL");
		expect(result.closeSatisfied).toBe(false);
		expect(result.error).toContain("no route");
		expect(calls).toContain("reportActivity:1");
	});
});
