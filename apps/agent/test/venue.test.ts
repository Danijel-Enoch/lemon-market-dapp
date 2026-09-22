import { describe, expect, it, mock } from "bun:test";
import { PacificaError } from "@lemon/pacifica";
import type { Hex } from "viem";
import { ValuationError } from "../src/valuation";
import { allocateUnwind, createVenueAdapter, type VenueDeps } from "../src/venue";
import { VenueExecutionError } from "../src/worker";

/**
 * The unwind path, which is the half of the adapter a depositor depends on.
 *
 * Closing both legs is not what pays a redemption — the proceeds sit at the
 * agent's own wallets until `returnToVault` moves them into the contract, and
 * `freeAssets` does not count a cent before then. So these tests are mostly
 * about one question: how much USDC actually reached the vault, and was it a
 * number the wallet really held.
 */

const USDC = 1_000_000n;
const UNIT = 10n ** 18n;

const SPOT_TOKEN = "0x0000000000000000000000000000000000000002" as const;
const USDC_TOKEN = "0x0000000000000000000000000000000000000003" as const;
const AGENT = "0x0000000000000000000000000000000000000004" as const;
const ROUTER = "0x0000000000000000000000000000000000000005" as const;

interface HarnessOptions {
	/** Spot tokens the agent holds, in `spotTokenDecimals`. */
	spotBalance?: bigint;
	/**
	 * The spot token's decimals. Eighteen by default; the Coinbase equity tokens
	 * are eight, which is where a units mix-up actually bites.
	 */
	spotTokenDecimals?: number;
	/** The open perp size, as the venue's own decimal string. */
	perpSize?: string;
	/** Pacifica's quantity grid for the market, as its own decimal string. */
	lotSize?: string;
	/** Mine the swap, but reverted — which viem reports as a receipt, not a throw. */
	swapReverts?: boolean;
	/** What an executable sell of the whole holding returns. */
	spotValueUsdc?: bigint;
	/** Pacifica's mark for the market, as the venue's own decimal string. */
	mark?: string;
	/** What the swap actually delivers, which need not be what was quoted. */
	fillUsdc?: bigint;
	/** Pacifica's own `available_to_withdraw`, as the venue's decimal string. */
	availableToWithdraw?: string;
	/** USDC lost in transit on the way home. */
	bridgeFeeUsdc?: bigint;
	bridgeFails?: boolean;
	withdrawalFails?: boolean;
	/** USDC stranded in the agent's Solana wallet, outside the venue. */
	solanaIdleUsdc?: bigint;
	/**
	 * Whether Pacifica has ever seen this account.
	 *
	 * False is the ordinary state of a vault that has not deployed yet — the venue
	 * has no registration call, and the account is created by its first deposit —
	 * so every account endpoint answers with an error until then.
	 */
	accountRegistered?: boolean;
	/** An error every account read throws instead of answering. */
	accountFailure?: Error;
}

function harness(options: HarnessOptions = {}) {
	const spotBalance = options.spotBalance ?? 10n * UNIT;
	const spotValueUsdc = options.spotValueUsdc ?? 1_000n * USDC;
	const fillUsdc = options.fillUsdc ?? 1_000n * USDC;
	const bridgeFee = options.bridgeFeeUsdc ?? 0n;

	// The agent's own balances, moved by the mocked transactions rather than
	// asserted on directly: the adapter reads them either side of the swap, so a
	// harness that did not move them would let a quote-based regression pass.
	const balances = { spot: spotBalance, usdc: 0n };

	// The two prices, mutable so a test can drive them across ticks. The adapter
	// holds a haircut window between calls to `observe`, so anything about how the
	// spot leg is marked needs more than one read to show up at all.
	const feed = { spotValueUsdc, mark: options.mark ?? "100", routable: true };

	const publicClient = {
		readContract: async ({ functionName, address }: { functionName: string; address: string }) => {
			if (functionName === "balanceOf") {
				return address === SPOT_TOKEN ? balances.spot : balances.usdc;
			}
			if (functionName === "allowance") return 2n ** 200n;
			throw new Error(`unexpected read: ${functionName}`);
		},
		waitForTransactionReceipt: async () => ({
			status: options.swapReverts ? "reverted" : "success",
		}),
	};

	const walletClient = {
		account: { address: AGENT },
		sendTransaction: async () => {
			// A reverted transaction moves nothing, which is the state that made the
			// missing status check invisible: the balance read afterwards is simply
			// unchanged, and a delta of zero looks like a fill of zero.
			if (!options.swapReverts) balances.usdc += fillUsdc;
			return "0xsell" as Hex;
		},
		writeContract: async () => "0xapprove" as Hex,
	};

	const kyber = {
		getRoute: async () =>
			feed.routable
				? {
						ok: true as const,
						quote: { amountOut: feed.spotValueUsdc.toString(), routeSummary: {} },
					}
				: { ok: false as const },
		buildRoute: async () => ({
			// `to` and `routerAddress` are the same here, as they are on KyberSwap.
			// They are separate fields because LI.FI's differ: the allowance sits on
			// one contract and the transaction goes to another.
			to: ROUTER,
			routerAddress: ROUTER,
			data: "0xdeadbeef",
			value: "0",
			amountIn: "0",
			gas: "0",
			// Deliberately more than the fill above, so a return sized off the
			// quote instead of the balance is visible as a failure.
			amountOut: (fillUsdc + 50n * USDC).toString(),
		}),
	};

	const requestWithdrawal = mock(async () => {
		if (options.withdrawalFails) throw new Error("venue withdrawal rejected");
		return { success: true };
	});

	const registered = options.accountRegistered ?? true;
	const accountFailure = () =>
		options.accountFailure ?? (registered ? null : new PacificaError(404, "Account not found"));

	const pacifica = {
		createMarketOrder: mock(async () => ({ order_id: "order-1" })),
		accountInfo: mock(async () => {
			const failure = accountFailure();
			if (failure) throw failure;
			return {
				available_to_withdraw: options.availableToWithdraw ?? "500",
				account_equity: "500",
			};
		}),
		requestWithdrawal,
		positions: async () => {
			const failure = accountFailure();
			if (failure) throw failure;
			return options.perpSize
				? [{ symbol: "NVDA", amount: options.perpSize, entry_price: "100" }]
				: [];
		},
		prices: async () => [
			{
				symbol: "NVDA",
				mark: feed.mark,
				oracle: "100",
				yesterday_price: "100",
				funding: "0.0001",
			},
		],
		// `lot_size` is load-bearing: every perp order is snapped down onto this
		// grid, and Pacifica rejects a size that is not a multiple of it. Fine
		// enough here that the existing sizes pass through unchanged.
		markets: async () => [
			{ symbol: "NVDA", funding_rate: "0.0001", lot_size: options.lotSize ?? "0.00000001" },
		],
	};

	// Credits the agent's Base balance, because that is what a bridge does — and
	// `closeAll` sweeps that balance rather than adding up what each step was
	// expected to contribute. A mock that reported a landing without moving the
	// balance would let a sweep that reads the wrong account pass.
	const toBase = mock(async (amount: bigint) => {
		if (options.bridgeFails) throw new Error("bridge is down");
		const landed = amount - bridgeFee;
		balances.usdc += landed;
		return { txRef: "0xbridge" as Hex, landed };
	});

	const returnToVault = mock(async () => "0xreturn" as Hex);

	const deps = {
		config: {
			markets: [
				{
					ticker: "NVDA",
					symbol: "NVDAc",
					spotToken: SPOT_TOKEN,
					spotTokenDecimals: options.spotTokenDecimals ?? 18,
					perpSymbol: "NVDA",
					targetWeightBps: 10_000,
				},
			],
			usdc: USDC_TOKEN,
			solanaAddress: "SoLanaAgent1111111111111111111111111111111",
			agentAddress: AGENT,
			slippagePercent: 0.5,
		},
		publicClient,
		walletClient,
		kyber,
		pacifica,
		signPacifica: async () => "signature",
		bridge: { toSolana: async () => ({ txRef: "0xout" as Hex, landed: 0n }), toBase },
		returnToVault,
		inFlight: () => 0n,
		solanaIdleUsdc: async () => options.solanaIdleUsdc ?? 0n,
		now: () => 1_800_000_000,
	} as unknown as VenueDeps;

	return {
		adapter: createVenueAdapter(deps),
		feed,
		returnToVault,
		requestWithdrawal,
		toBase,
		balances,
		createMarketOrder: pacifica.createMarketOrder,
		accountInfo: pacifica.accountInfo,
	};
}

/**
 * The read that has to survive a vault that has never traded.
 *
 * Pacifica has no registration call: an account exists once USDC has been
 * deposited to it, and the agent makes that deposit inside a deployment. So a
 * new vault's first tick reads an account the venue has never heard of — and a
 * read that treats the answer as a failure ends the tick before the deployment
 * that would create the account, on every tick, forever. These are about that
 * deadlock, which is not one a new vault can leave on its own.
 */
describe("observe", () => {
	it("prices a vault whose Pacifica account does not exist yet", async () => {
		const { adapter } = harness({
			accountRegistered: false,
			spotBalance: 0n,
			spotValueUsdc: 0n,
		});

		const observation = await adapter.observe();

		// No margin, because there is no account to hold any — not an error, and
		// not a stale NAV.
		expect(observation.valuation.components.perpEquity).toBe(0n);
		expect(observation.valuation.deployedAssets).toBe(0n);
		expect(observation.markets).toHaveLength(1);
		expect(observation.markets[0].perpUnits).toBe(0n);
	});

	/**
	 * The state that follows a crossing which landed and failed to deposit: the
	 * account still does not exist, and the USDC is real and sitting on Solana.
	 * Pricing it at zero would report the whole transfer as a loss.
	 */
	it("still counts USDC stranded on Solana while the account is unregistered", async () => {
		const { adapter } = harness({
			accountRegistered: false,
			spotBalance: 0n,
			spotValueUsdc: 0n,
			solanaIdleUsdc: 40n * USDC,
		});

		const observation = await adapter.observe();

		expect(observation.valuation.components.idleAtAgent).toBe(40n * USDC);
		expect(observation.valuation.deployedAssets).toBe(40n * USDC);
	});

	/**
	 * The tolerance is for one specific answer. A venue that is down, rate-limiting
	 * or rejecting the signature is not an empty account, and reporting a NAV
	 * missing the margin would mark every holder down by it.
	 */
	it("refuses to price the vault when the venue fails for any other reason", async () => {
		const { adapter } = harness({
			accountFailure: new PacificaError(500, "internal error"),
		});

		expect(adapter.observe()).rejects.toThrow(/internal error/);
	});
});

/**
 * The two legs are supposed to cancel, and they only cancel if they are priced
 * off the same thing.
 *
 * They were not: the perp leg marks continuously off Pacifica while the spot leg
 * was an executable Kyber quote, and a thin pool only reprices when somebody
 * trades it. So the spot leg held a stale number while the perp leg moved, and
 * the vault was marked as a naked short in between — on the live vault that
 * artifact moved NAV further in five minutes than a whole day of real profit and
 * loss. These are the two halves of that, driven through the real adapter.
 */
describe("observe, across ticks", () => {
	/** Run the adapter past its warm-up with the quote and mark left alone. */
	async function warm(adapter: { observe: () => Promise<unknown> }, ticks = 12) {
		for (let i = 0; i < ticks; i++) await adapter.observe();
	}

	it("holds the spot leg still while the pool's quote jumps and the mark does not", async () => {
		const { adapter, feed } = harness({ spotBalance: 10n * UNIT, spotValueUsdc: 1_000n * USDC });
		await warm(adapter);

		const values: bigint[] = [];
		// The quote stepping around while the mark sits exactly where it was.
		for (const quote of [998n, 1_002n, 997n, 1_003n, 999n, 1_001n]) {
			feed.spotValueUsdc = quote * USDC;
			values.push((await adapter.observe()).valuation.components.spot);
		}

		const spread =
			values.reduce((a, b) => (a > b ? a : b)) - values.reduce((a, b) => (a < b ? a : b));
		// The quotes span $6. The leg does not move at all, because nothing it is
		// priced against did.
		expect(spread).toBe(0n);
		expect(values[0]).toBe(1_000n * USDC);
	});

	it("moves the spot leg with the mark while the pool's quote is frozen", async () => {
		const { adapter, feed } = harness({ spotBalance: 10n * UNIT, spotValueUsdc: 1_000n * USDC });
		await warm(adapter);

		const before = (await adapter.observe()).valuation.components.spot;
		// The pool has not traded, so its quote is unchanged — the mark is the only
		// thing that moved, and the leg has to follow it.
		feed.mark = "101";
		const after = (await adapter.observe()).valuation.components.spot;

		expect(before).toBe(1_000n * USDC);
		expect(after).toBe(1_010n * USDC);
	});

	/**
	 * Every fallback is the behaviour this replaced. A first tick has no window to
	 * settle on, so it is the raw quote — which is also what a restarted agent
	 * reports until it has warmed back up.
	 */
	it("uses the raw quote before the window is warm", async () => {
		const { adapter } = harness({ spotBalance: 10n * UNIT, spotValueUsdc: 993n * USDC });
		expect((await adapter.observe()).valuation.components.spot).toBe(993n * USDC);
	});

	/**
	 * The catch for a pool that has genuinely dislocated rather than jittered.
	 * Marking through that off a comfortable median would report a vault richer
	 * than it can liquidate, which is what the executable quote existed to prevent.
	 */
	it("believes a dislocated pool over its own settled level", async () => {
		const { adapter, feed } = harness({ spotBalance: 10n * UNIT, spotValueUsdc: 1_000n * USDC });
		await warm(adapter);

		feed.spotValueUsdc = 500n * USDC;
		expect((await adapter.observe()).valuation.components.spot).toBe(500n * USDC);
	});

	/**
	 * A dead price feed must not be papered over with the position's entry price.
	 *
	 * `observe` keeps an entry-price fallback so an unpriced *notional* does not
	 * read as zero, but entry is a stale price and valuing the spot leg on one
	 * would put back the staleness this whole thing removes — and would feed a
	 * ratio measured against it into the window, so the error would outlive the
	 * outage. The raw quote is the honest answer while the venue is down.
	 */
	it("falls back to the raw quote when the venue has no mark, not to entry price", async () => {
		const { adapter, feed } = harness({
			spotBalance: 10n * UNIT,
			spotValueUsdc: 1_000n * USDC,
			perpSize: "-10",
		});
		await warm(adapter);

		feed.mark = "0";
		feed.spotValueUsdc = 993n * USDC;
		// Entry price is "100" in the harness, so a leg valued against it would
		// come back at $1,000 — the stale number this must not report.
		expect((await adapter.observe()).valuation.components.spot).toBe(993n * USDC);
	});

	/** An unroutable pool is still an unknown value, not a cheap one. */
	it("still refuses a leg it cannot route at all", async () => {
		const { adapter, feed } = harness({ spotBalance: 10n * UNIT, spotValueUsdc: 1_000n * USDC });
		await warm(adapter);

		feed.routable = false;
		expect(adapter.observe()).rejects.toThrow(ValuationError);
	});
});

describe("unwind", () => {
	it("returns the spot proceeds and the freed margin to the vault", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			bridgeFeeUsdc: 2n * USDC,
		});

		const activity = await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		// $1,000 sold on Base, plus $500 of margin less $2 of bridge fee.
		expect(returnToVault).toHaveBeenCalledWith(1_498n * USDC);
		expect(activity.map((a) => a.kind)).toEqual([
			"PERP_CLOSE",
			"SPOT_SELL",
			"VENUE_WITHDRAW",
			"BRIDGE_OUT",
			"BRIDGE_IN",
		]);
		expect(activity.find((a) => a.kind === "BRIDGE_IN")?.baseAmount).toBe(1_498n * USDC);
		// The bridge's cut is recorded as a fee rather than quietly vanishing
		// between two rows that do not add up.
		expect(activity.find((a) => a.kind === "BRIDGE_OUT")?.feeAssets).toBe(2n * USDC);
	});

	/**
	 * A partial unwind must not undo the margin buffer.
	 *
	 * Pacifica reserves the notional at the account's 1x setting and calls the
	 * rest withdrawable, so the buffer backing the *surviving* hedge reads as free
	 * to the venue. Sweeping it home would leave what is still open sitting at
	 * exactly its ceiling, and the next NAV report reverting — the same breach the
	 * buffer exists to prevent, reached from the other side.
	 */
	it("leaves the surviving position's buffer at the venue", async () => {
		// 10 units at a mark of 100 is $1,000 of notional still open.
		const { adapter, returnToVault } = harness({
			perpSize: "10",
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
		});

		await adapter.unwind({ leverageBps: 9_700, amount: 1_000n * USDC });

		// $1,000 of notional at 0.97x wants $1,030.93 of equity; the venue already
		// holds $1,000 of that against its own requirement, so $30.93 of what it
		// calls free is spoken for. $500 - $30.93 comes home with the $1,000 of
		// spot proceeds.
		const retained = (1_000n * USDC * 10_000n) / 9_700n - 1_000n * USDC;
		expect(returnToVault).toHaveBeenCalledWith(1_500n * USDC - retained);
	});

	it("keeps nothing back when there is no position left to back", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
		});

		await adapter.unwind({ leverageBps: 9_700, amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(1_500n * USDC);
	});

	/**
	 * The quote is a promise and the fill is the fact. `agentReturn` pulls real
	 * tokens, so a return sized off the quote reverts the whole call — after
	 * both legs have already been closed.
	 */
	it("returns what the swap delivered, not what it quoted", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 940n * USDC,
			availableToWithdraw: "0",
		});

		await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(940n * USDC);
	});

	/**
	 * The close is sized so the spot proceeds alone cover the request, so the
	 * queue is payable whether or not the margin makes it home. Throwing here
	 * would sell a depositor's position and still leave them unpaid.
	 */
	it("still returns the spot proceeds when the bridge is down", async () => {
		const { adapter, returnToVault } = harness({ fillUsdc: 1_000n * USDC, bridgeFails: true });

		const activity = await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
		expect(activity.map((a) => a.kind)).not.toContain("BRIDGE_OUT");
	});

	it("still returns the spot proceeds when the venue refuses the withdrawal", async () => {
		const { adapter, returnToVault, toBase } = harness({
			fillUsdc: 1_000n * USDC,
			withdrawalFails: true,
		});

		await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
		// Nothing is bridged on the strength of a withdrawal that was refused.
		expect(toBase).not.toHaveBeenCalled();
	});

	it("does not ask the venue for a withdrawal with nothing free to withdraw", async () => {
		const { adapter, requestWithdrawal, returnToVault } = harness({
			availableToWithdraw: "0",
		});

		await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		expect(requestWithdrawal).not.toHaveBeenCalled();
		expect(returnToVault).toHaveBeenCalled();
	});
});

/**
 * Which markets an unwind comes out of.
 *
 * The allocation decides whose exposure gets sold, so it is worth being able to
 * state what it does in cases that are awkward to reach through a live venue.
 */
/**
 * A transaction that reverts is still a transaction: viem resolves
 * `waitForTransactionReceipt` for it and puts `status: "reverted"` in the
 * receipt. Reading the hash and not the status is how a reverted spot buy was
 * recorded as a completed one — with a zero-token `SPOT_BUY` row pointing at
 * the reverted transaction, the naked-short unwind skipped because nothing
 * threw, and a leveraged short left open with nothing behind it.
 */
describe("a reverted transaction", () => {
	it("fails the unwind rather than reporting proceeds it never received", async () => {
		const { adapter } = harness({
			spotBalance: 10n * 10n ** 18n,
			spotValueUsdc: 1_000n * USDC,
			fillUsdc: 1_000n * USDC,
			swapReverts: true,
		});

		// Wrapped by the caller, which adds what the failure left behind. The
		// revert is the cause; the message is about the position.
		const error = await adapter
			.unwind({ leverageBps: 10_000, amount: 500n * USDC })
			.catch((e) => e);
		expect(error).toBeInstanceOf(VenueExecutionError);
		expect(error.message).toContain("Spot sell failed");
		expect(String((error as Error).cause)).toContain("reverted on Base");
	});

	it("does not hand the vault USDC the swap never produced", async () => {
		const { adapter, returnToVault } = harness({
			spotBalance: 10n * 10n ** 18n,
			spotValueUsdc: 1_000n * USDC,
			fillUsdc: 1_000n * USDC,
			swapReverts: true,
		});

		await adapter.unwind({ leverageBps: 10_000, amount: 500n * USDC }).catch(() => {});

		expect(returnToVault).not.toHaveBeenCalled();
	});
});

describe("allocateUnwind", () => {
	const leg = (ticker: string, value: bigint, targetWeightBps: number, sellable = true) => ({
		ticker,
		value,
		targetWeightBps,
		sellable,
	});

	/**
	 * Raising cash and correcting the weights are the same trade. A vault that
	 * has drifted to 60/40 against a 50/50 mandate pays its next redemption
	 * entirely out of the heavy side and comes back to neutral for free.
	 */
	it("takes from the overweight side first", () => {
		const allocation = allocateUnwind(
			[leg("BTC", 6_000n * USDC, 5_000), leg("ETH", 4_000n * USDC, 5_000)],
			1_000n * USDC,
		);
		expect(allocation).toEqual([{ ticker: "BTC", amount: 1_000n * USDC }]);
	});

	it("stops at the overweight rather than draining the heavy leg", () => {
		const allocation = allocateUnwind(
			[leg("BTC", 6_000n * USDC, 5_000), leg("ETH", 4_000n * USDC, 5_000)],
			1_500n * USDC,
		);
		// BTC is $1,000 over its half; the remaining $500 comes from the largest
		// leg with room left, which is still BTC.
		expect(allocation.find((a) => a.ticker === "BTC")?.amount).toBe(1_500n * USDC);
	});

	/**
	 * Greedy from the largest, not proportional across all. Proportional is the
	 * tidier-looking answer and the more expensive one: every market touched is a
	 * perp order and a swap through its own pool, paying two sets of fees to
	 * preserve ratios the next deployment restores anyway.
	 */
	it("touches as few markets as it can", () => {
		const allocation = allocateUnwind(
			[
				leg("BTC", 5_000n * USDC, 3_400),
				leg("ETH", 5_000n * USDC, 3_300),
				leg("SOL", 5_000n * USDC, 3_300),
			],
			1_000n * USDC,
		);
		// ETH and SOL are $50 over their share each — real drift, and not worth a
		// perp order and a swap apiece to correct. The whole amount comes out of
		// one leg instead, and the next deployment removes the drift for free.
		expect(allocation).toHaveLength(1);
	});

	/** A retired market has a target of zero, so it is entirely overweight. */
	it("drains a retired market before touching anything else", () => {
		const allocation = allocateUnwind(
			[leg("NVDA", 2_000n * USDC, 0), leg("BTC", 8_000n * USDC, 10_000)],
			2_000n * USDC,
		);
		expect(allocation).toEqual([{ ticker: "NVDA", amount: 2_000n * USDC }]);
	});

	/**
	 * An unroutable market still counts toward the weights — leaving it out would
	 * inflate every other market's share and report the whole vault as overweight
	 * — but nothing can be raised from it.
	 */
	it("never allocates to a market it cannot sell", () => {
		const allocation = allocateUnwind(
			[leg("NVDA", 6_000n * USDC, 5_000, false), leg("BTC", 4_000n * USDC, 5_000)],
			2_000n * USDC,
		);
		expect(allocation).toEqual([{ ticker: "BTC", amount: 2_000n * USDC }]);
	});

	it("gives back everything it can when asked for more than exists", () => {
		const allocation = allocateUnwind(
			[leg("BTC", 3_000n * USDC, 5_000), leg("ETH", 1_000n * USDC, 5_000)],
			10_000n * USDC,
		);
		expect(allocation.reduce((sum, a) => sum + a.amount, 0n)).toBe(4_000n * USDC);
	});

	it("allocates nothing against an empty position", () => {
		expect(allocateUnwind([leg("BTC", 0n, 10_000)], 1_000n * USDC)).toEqual([]);
	});
});

describe("closeAll", () => {
	/**
	 * A close order sweeps, and keeps no buffer back — there is no surviving
	 * position for a buffer to be backing. Asserted with a position still on the
	 * venue's books so this is discrimination rather than a vacuous pass.
	 */
	it("sweeps the margin account rather than trimming it", async () => {
		const { adapter, returnToVault } = harness({
			perpSize: "10",
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
		});

		await adapter.closeAll();

		expect(returnToVault).toHaveBeenCalledWith(1_500n * USDC);
	});

	it("closes the leg, sweeps the margin, and sends everything home", async () => {
		const { adapter, returnToVault, requestWithdrawal } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
		});

		const activity = await adapter.closeAll();

		expect(requestWithdrawal).toHaveBeenCalled();
		expect(returnToVault).toHaveBeenCalledWith(1_500n * USDC);
		expect(activity.map((a) => a.kind)).toEqual([
			"PERP_CLOSE",
			"SPOT_SELL",
			"VENUE_WITHDRAW",
			"BRIDGE_OUT",
			"BRIDGE_IN",
		]);
	});

	/**
	 * The sweep is what makes this different from a large unwind. USDC stranded
	 * in the Solana wallet by a failed deposit is picked up by the next
	 * deployment for free — but a close order has no next deployment.
	 */
	it("brings home USDC stranded outside the venue", async () => {
		const { adapter, toBase } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			solanaIdleUsdc: 40n * USDC,
		});

		await adapter.closeAll();

		expect(toBase).toHaveBeenCalledWith(540n * USDC);
	});

	/**
	 * A close order on a vault that never opened a position still has work to do:
	 * a crossing that landed and failed to deposit left USDC on Solana, and the
	 * account it would have funded does not exist. Refusing on the missing account
	 * would leave the order outstanding with the money stranded.
	 */
	it("sweeps a vault whose Pacifica account was never created", async () => {
		const { adapter, toBase, requestWithdrawal, returnToVault } = harness({
			accountRegistered: false,
			spotBalance: 0n,
			spotValueUsdc: 0n,
			solanaIdleUsdc: 40n * USDC,
		});

		await adapter.closeAll();

		// Nothing to withdraw from an account that holds nothing, but the stranded
		// balance still comes home.
		expect(requestWithdrawal).not.toHaveBeenCalled();
		expect(toBase).toHaveBeenCalledWith(40n * USDC);
		expect(returnToVault).toHaveBeenCalledWith(40n * USDC);
	});

	it("leaves the stranded balance alone on an ordinary unwind", async () => {
		const { adapter, toBase } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			solanaIdleUsdc: 40n * USDC,
		});

		await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		expect(toBase).toHaveBeenCalledWith(500n * USDC);
	});

	/**
	 * The regression this exists for.
	 *
	 * A close order names the *larger* of the two legs so the perp reaches zero,
	 * and the two legs are measured in different bases: the venue reports its
	 * position in a 1e18 unit count, the wallet holds an 8-decimal token. Compared
	 * without rescaling, the perp figure wins every time by ten orders of
	 * magnitude — and that number goes straight into the order amount and the swap
	 * input. The assertion is on the order the venue actually receives, because
	 * that is where the mistake would be spent.
	 */
	it("sizes the close in the token's decimals, not the perp's unit basis", async () => {
		// 100 tokens at 8dp against an open short of 100.
		const { adapter, createMarketOrder } = harness({
			spotTokenDecimals: 8,
			spotBalance: 100n * 10n ** 8n,
			perpSize: "100",
			fillUsdc: 1_000n * USDC,
		});

		await adapter.closeAll();

		expect(createMarketOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ symbol: "NVDA", side: "bid", reduceOnly: true, amount: "100" }),
		);
	});

	/**
	 * Pacifica rejects the whole order — not the remainder — when its size is not
	 * a multiple of `lot_size`. The live failure was a deploy quoting 0.07210227
	 * NVDA against a 0.001 grid; nothing the agent computes lands on that grid by
	 * accident, because every quantity comes from a Kyber quote, an ERC-20
	 * balance, or the difference between two legs.
	 */
	it("rounds an order down onto the venue's lot grid", async () => {
		const { adapter, createMarketOrder } = harness({
			spotTokenDecimals: 8,
			// 0.07210227, the size the venue refused.
			spotBalance: 7_210_227n,
			perpSize: "0.07210227",
			lotSize: "0.001",
			fillUsdc: 16n * USDC,
		});

		await adapter.closeAll();

		expect(createMarketOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ amount: "0.072" }),
		);
	});

	/** Down, never up: a close rounded up asks to close more than is held. */
	it("never rounds an order up past what is open", async () => {
		const { adapter, createMarketOrder } = harness({
			spotTokenDecimals: 8,
			spotBalance: 199_900_000n, // 1.999
			perpSize: "1.999",
			lotSize: "0.01",
			fillUsdc: 400n * USDC,
		});

		await adapter.closeAll();

		expect(createMarketOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ amount: "1.99" }),
		);
	});

	/** A position finer than one lot cannot be reduced at all, so nothing is sent. */
	it("sends no order when the whole position is below one lot", async () => {
		const { adapter, createMarketOrder } = harness({
			spotTokenDecimals: 8,
			spotBalance: 50_000n, // 0.0005
			perpSize: "0.0005",
			lotSize: "0.001",
			fillUsdc: 1n * USDC,
		});

		await adapter.closeAll();

		expect(createMarketOrder).not.toHaveBeenCalled();
	});

	/** The perp leg is the one that has to reach zero, even when spot has drifted. */
	it("closes against the perp size when it is the larger leg", async () => {
		const { adapter, createMarketOrder } = harness({
			spotTokenDecimals: 8,
			spotBalance: 90n * 10n ** 8n,
			perpSize: "100",
			fillUsdc: 900n * USDC,
		});

		await adapter.closeAll();

		expect(createMarketOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ amount: "100" }),
		);
	});

	/**
	 * The sweep, and why a close is not a large unwind.
	 *
	 * Idle USDC at the agent counts toward the vault's reported NAV, so a close
	 * that returned only what it raised would leave `deployedAssets` above the
	 * dust threshold — the order would never read as satisfied, and the agent
	 * would retry a close with nothing left to close on every tick from then on.
	 */
	it("sweeps USDC already at the agent, not just what this close raised", async () => {
		const { adapter, returnToVault, balances } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "0",
		});
		// Left over from a deployment that drew capital down and then failed.
		balances.usdc += 250n * USDC;

		await adapter.closeAll();

		expect(returnToVault).toHaveBeenCalledWith(1_250n * USDC);
	});

	it("leaves that same balance alone on an ordinary unwind", async () => {
		const { adapter, returnToVault, balances } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "0",
		});
		balances.usdc += 250n * USDC;

		await adapter.unwind({ leverageBps: 10_000, amount: 1_000n * USDC });

		// An unwind returns what it raised. The rest is usually capital
		// mid-deployment that the next tick will put to work.
		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
	});

	it("does nothing to a position that is already flat", async () => {
		const { adapter, returnToVault, createMarketOrder } = harness({
			spotBalance: 0n,
			spotValueUsdc: 0n,
			availableToWithdraw: "0",
		});

		expect(await adapter.closeAll()).toEqual([]);
		expect(createMarketOrder).not.toHaveBeenCalled();
		expect(returnToVault).not.toHaveBeenCalled();
	});

	/**
	 * A close that gets most of the way there has not served its purpose. What
	 * could be sent home is, and the operator is told by name which part is
	 * still open rather than being shown a vault that reports itself closed.
	 */
	it("returns what it could and names what it could not", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			bridgeFails: true,
		});

		await expect(adapter.closeAll()).rejects.toThrow(/margin account/);
		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
	});
});
