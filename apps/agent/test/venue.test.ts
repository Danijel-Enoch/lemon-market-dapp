import { describe, expect, it, mock } from "bun:test";
import type { Hex } from "viem";
import { createVenueAdapter, type VenueDeps } from "../src/venue";

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
	/** Spot tokens the agent holds, at 1e18. */
	spotBalance?: bigint;
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
		positions: async () => [],
	};

	const toBase = mock(async (amount: bigint) => {
		if (options.bridgeFails) throw new Error("bridge is down");
		return { txRef: "0xbridge" as Hex, landed: amount - bridgeFee };
	});

	const returnToVault = mock(async () => "0xreturn" as Hex);

	const deps = {
		config: {
			symbol: "NVDA",
			spotToken: SPOT_TOKEN,
			spotTokenDecimals: 18,
			usdc: USDC_TOKEN,
			perpSymbol: "NVDA",
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
		now: () => 1_800_000_000,
	} as unknown as VenueDeps;

	return { adapter: createVenueAdapter(deps), returnToVault, requestWithdrawal, toBase, balances };
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
