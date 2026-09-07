import { describe, expect, it, mock } from "bun:test";
import type { Hex } from "viem";
import { allocateUnwind, createVenueAdapter, type VenueDeps } from "../src/venue";

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
	/** What an executable sell of the whole holding returns. */
	spotValueUsdc?: bigint;
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

	const publicClient = {
		readContract: async ({ functionName, address }: { functionName: string; address: string }) => {
			if (functionName === "balanceOf") {
				return address === SPOT_TOKEN ? balances.spot : balances.usdc;
			}
			if (functionName === "allowance") return 2n ** 200n;
			throw new Error(`unexpected read: ${functionName}`);
		},
		waitForTransactionReceipt: async () => ({ status: "success" }),
	};

	const walletClient = {
		account: { address: AGENT },
		sendTransaction: async () => {
			balances.usdc += fillUsdc;
			return "0xsell" as Hex;
		},
		writeContract: async () => "0xapprove" as Hex,
	};

	const kyber = {
		getRoute: async () => ({
			ok: true as const,
			quote: { amountOut: spotValueUsdc.toString(), routeSummary: {} },
		}),
		buildRoute: async () => ({
			routerAddress: ROUTER,
			data: "0xdeadbeef",
			// Deliberately more than the fill above, so a return sized off the
			// quote instead of the balance is visible as a failure.
			amountOut: (fillUsdc + 50n * USDC).toString(),
		}),
	};

	const requestWithdrawal = mock(async () => {
		if (options.withdrawalFails) throw new Error("venue withdrawal rejected");
		return { success: true };
	});

	const pacifica = {
		createMarketOrder: mock(async () => ({ order_id: "order-1" })),
		accountInfo: async () => ({
			available_to_withdraw: options.availableToWithdraw ?? "500",
			account_equity: "500",
		}),
		requestWithdrawal,
		positions: async () =>
			options.perpSize ? [{ symbol: "NVDA", amount: options.perpSize, entry_price: "100" }] : [],
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
		returnToVault,
		requestWithdrawal,
		toBase,
		balances,
		createMarketOrder: pacifica.createMarketOrder,
	};
}

describe("unwind", () => {
	it("returns the spot proceeds and the freed margin to the vault", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			bridgeFeeUsdc: 2n * USDC,
		});

		const activity = await adapter.unwind({ amount: 1_000n * USDC });

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
	 * The quote is a promise and the fill is the fact. `agentReturn` pulls real
	 * tokens, so a return sized off the quote reverts the whole call — after
	 * both legs have already been closed.
	 */
	it("returns what the swap delivered, not what it quoted", async () => {
		const { adapter, returnToVault } = harness({
			fillUsdc: 940n * USDC,
			availableToWithdraw: "0",
		});

		await adapter.unwind({ amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(940n * USDC);
	});

	/**
	 * The close is sized so the spot proceeds alone cover the request, so the
	 * queue is payable whether or not the margin makes it home. Throwing here
	 * would sell a depositor's position and still leave them unpaid.
	 */
	it("still returns the spot proceeds when the bridge is down", async () => {
		const { adapter, returnToVault } = harness({ fillUsdc: 1_000n * USDC, bridgeFails: true });

		const activity = await adapter.unwind({ amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
		expect(activity.map((a) => a.kind)).not.toContain("BRIDGE_OUT");
	});

	it("still returns the spot proceeds when the venue refuses the withdrawal", async () => {
		const { adapter, returnToVault, toBase } = harness({
			fillUsdc: 1_000n * USDC,
			withdrawalFails: true,
		});

		await adapter.unwind({ amount: 1_000n * USDC });

		expect(returnToVault).toHaveBeenCalledWith(1_000n * USDC);
		// Nothing is bridged on the strength of a withdrawal that was refused.
		expect(toBase).not.toHaveBeenCalled();
	});

	it("does not ask the venue for a withdrawal with nothing free to withdraw", async () => {
		const { adapter, requestWithdrawal, returnToVault } = harness({
			availableToWithdraw: "0",
		});

		await adapter.unwind({ amount: 1_000n * USDC });

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

	it("leaves the stranded balance alone on an ordinary unwind", async () => {
		const { adapter, toBase } = harness({
			fillUsdc: 1_000n * USDC,
			availableToWithdraw: "500",
			solanaIdleUsdc: 40n * USDC,
		});

		await adapter.unwind({ amount: 1_000n * USDC });

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

		await adapter.unwind({ amount: 1_000n * USDC });

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
