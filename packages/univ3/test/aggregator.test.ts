import { describe, expect, it } from "bun:test";
import { decodeFunctionData, parseAbi } from "viem";
import {
	UniswapV3AggregatorClient,
	type UniswapV3RouteSummary,
	XLAYER_USDC,
	XLAYER_USDG,
} from "../src/index";

/**
 * Everything here is offline.
 *
 * Quoting needs the chain and is covered by actually running it; what is worth
 * pinning in a test is the half that turns a quote into a transaction, because
 * its failures are silent. A mis-encoded path swaps through the wrong pool at a
 * price that still looks reasonable, and a slippage floor computed the wrong
 * way is only discovered by a fill that should have reverted and did not.
 */

const routerAbi = parseAbi([
	"function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
	"function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
]);

const NVDAX = "0xa8DDb5Cd96b5222afe198316E9A57CaA642850D5" as const;
const SENDER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;

const client = () =>
	new UniswapV3AggregatorClient({ chainId: 196, rpcUrl: "http://localhost:0/unused" });

function directSummary(overrides: Partial<UniswapV3RouteSummary> = {}): UniswapV3RouteSummary {
	return {
		chainId: 196,
		tokenIn: XLAYER_USDC,
		tokenOut: NVDAX,
		amountIn: "1000000000",
		amountOut: "4000000000000000000",
		route: { kind: "direct", fee: 500, amountOut: 4000000000000000000n, gasEstimate: 150000n },
		bridgeAsset: XLAYER_USDG,
		...overrides,
	};
}

describe("buildRoute", () => {
	it("encodes a direct fill against the pool that was quoted", async () => {
		const built = await client().buildRoute({
			routeSummary: directSummary(),
			sender: SENDER,
			recipient: RECIPIENT,
		});

		const decoded = decodeFunctionData({ abi: routerAbi, data: built.data });
		expect(decoded.functionName).toBe("exactInputSingle");
		const args = decoded.args[0] as {
			tokenIn: string;
			tokenOut: string;
			fee: number;
			recipient: string;
			amountIn: bigint;
		};
		expect(args.fee).toBe(500);
		expect(args.recipient.toLowerCase()).toBe(RECIPIENT.toLowerCase());
		expect(args.amountIn).toBe(1000000000n);
	});

	it("floors the output at the quote less slippage, not at a fresh price", async () => {
		// The whole point of the floor: it is derived from the number the caller
		// decided on. A re-quote here would move the protection to a price nobody
		// agreed to.
		const built = await client().buildRoute({
			routeSummary: directSummary(),
			sender: SENDER,
			recipient: RECIPIENT,
			slippagePercent: 1,
		});
		const decoded = decodeFunctionData({ abi: routerAbi, data: built.data });
		const args = decoded.args[0] as { amountOutMinimum: bigint };
		expect(args.amountOutMinimum).toBe((4000000000000000000n * 9900n) / 10000n);
	});

	it("keeps a fractional slippage instead of rounding it to nothing", async () => {
		// 0.5% is the default the agent trades on; integer percent arithmetic
		// would floor it to 0 and send every swap with no protection at all.
		const built = await client().buildRoute({
			routeSummary: directSummary(),
			sender: SENDER,
			recipient: RECIPIENT,
			slippagePercent: 0.5,
		});
		const decoded = decodeFunctionData({ abi: routerAbi, data: built.data });
		const args = decoded.args[0] as { amountOutMinimum: bigint };
		expect(args.amountOutMinimum).toBe((4000000000000000000n * 9950n) / 10000n);
		expect(args.amountOutMinimum).toBeLessThan(4000000000000000000n);
	});

	it("encodes a bridged fill as one path through both pools", async () => {
		const built = await client().buildRoute({
			routeSummary: directSummary({
				route: { kind: "hop", feeIn: 500, feeOut: 3000, amountOut: 4n, gasEstimate: 250000n },
				amountOut: "4",
			}),
			sender: SENDER,
			recipient: RECIPIENT,
		});

		const decoded = decodeFunctionData({ abi: routerAbi, data: built.data });
		expect(decoded.functionName).toBe("exactInput");
		const args = decoded.args[0] as { path: string };

		// token(20) + fee(3) + token(20) + fee(3) + token(20), hex.
		expect(args.path.length).toBe(2 + (20 + 3 + 20 + 3 + 20) * 2);
		const path = args.path.toLowerCase();
		expect(path.startsWith(XLAYER_USDC.toLowerCase())).toBe(true);
		expect(path).toContain(XLAYER_USDG.toLowerCase().slice(2));
		expect(path.endsWith(NVDAX.toLowerCase().slice(2))).toBe(true);
		// Fees in order, as three-byte big-endian: 500 = 0x0001f4, 3000 = 0x000bb8.
		expect(path).toContain("0001f4");
		expect(path).toContain("000bb8");
	});

	it("approves the contract it actually calls", async () => {
		// They coincide for SwapRouter02 and do not for every aggregator, so the
		// pair is asserted rather than assumed by callers.
		const built = await client().buildRoute({
			routeSummary: directSummary(),
			sender: SENDER,
			recipient: RECIPIENT,
		});
		expect(built.routerAddress).toBe(built.to);
		expect(built.value).toBe("0");
	});

	it("refuses a route summary built for another chain", async () => {
		// The summary carries its chain so a quote cannot be replayed against a
		// different deployment, where the same addresses mean different tokens.
		await expect(
			client().buildRoute({
				routeSummary: directSummary({ chainId: 8453 }),
				sender: SENDER,
				recipient: RECIPIENT,
			}),
		).rejects.toThrow(/chain 8453/);
	});

	it("refuses anything that is not one of its own summaries", async () => {
		await expect(
			client().buildRoute({ routeSummary: { foo: 1 }, sender: SENDER, recipient: RECIPIENT }),
		).rejects.toThrow(/not a Uniswap V3 route/);
	});
});
