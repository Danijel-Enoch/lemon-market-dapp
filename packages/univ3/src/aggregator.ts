import type {
	Address,
	BuiltSwap,
	Hex,
	QuoteResult,
	RouteRequest,
	SpotAggregator,
	SpotQuote,
} from "@lemon/core";
import {
	createPublicClient,
	encodeFunctionData,
	encodePacked,
	getAddress,
	http,
	type PublicClient,
	parseAbi,
} from "viem";

/**
 * A spot aggregator that reads Uniswap V3 directly, without a routing service.
 *
 * Every other adapter here talks to an API that finds the pools for it —
 * KyberSwap on Base and Arbitrum, LI.FI on X Layer. This one does the routing
 * itself, and exists because on X Layer no such API can: LI.FI answers
 * "Could not find token on chain 196" for all fourteen of the tokens this app
 * trades there, and returns "No available quotes" even between two tokens it
 * does list. The pools are real — fifty-one of them across the fourteen
 * tokens, on the Uniswap V3 deployment at
 * `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` — so the gap was never
 * liquidity. It was that the router we asked had not indexed the chain.
 *
 * Reading the pools directly removes that dependency entirely. The trade is
 * that this adapter only knows Uniswap V3: it will not find a better fill on
 * some other venue, because it does not look. On a chain whose equity
 * liquidity is one deployment, that is the whole market anyway.
 *
 * ### Why the quote asset is split
 *
 * Liquidity on X Layer is not all quoted in the same stable. Some tokens have
 * a USDC pool, some only a USDG one, and which is which is a fact about the
 * chain rather than a preference — so a router that only tried the vault's own
 * USDC would find nothing for most of the board. Every quote therefore tries
 * the direct pair and the two-leg path through `bridgeAsset`, and takes
 * whichever actually delivers more. The hop costs a second pool's fee, so it
 * only wins where the direct pool is thin or absent, which is exactly when it
 * is needed.
 */

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const factoryAbi = parseAbi([
	"function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);

const poolAbi = parseAbi([
	"function liquidity() view returns (uint128)",
	"function token0() view returns (address)",
]);

/**
 * `QuoterV2`, declared `view` although the deployed functions are not.
 *
 * The quoter works by performing the swap and reverting with the result, so
 * Solidity cannot mark it `view` — but it is only ever reached through
 * `eth_call`, which is exactly what `view` means to a client. Declaring it so
 * is what lets these quotes ride in the same `multicall` batch as the pool
 * reads instead of becoming a round trip each.
 */
const quoterAbi = parseAbi([
	"function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
	"function quoteExactInput(bytes path, uint256 amountIn) view returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const routerAbi = parseAbi([
	"function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
	"function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
]);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The Uniswap V3 deployment on X Layer, confirmed against the chain. */
export const XLAYER_UNIV3 = {
	factory: "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
	quoter: "0xd1b797d92d87b688193a2b976efc8d577d204343",
	router: "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca",
} as const;

/** Bridged USDC on X Layer — the vault's asset, and the first quote tried. */
export const XLAYER_USDC = "0xB6CEceAB302E2E4948951eE7843FC24E92933061" as const;
/** USDG, which is the only stable several of the equity pools are quoted in. */
export const XLAYER_USDG = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8" as const;
/** Wrapped OKB, used to price the chain's gas in dollars. */
export const XLAYER_WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b" as const;

/**
 * Multicall3, at the address it holds on every chain that has it — X Layer
 * included, verified against the chain.
 *
 * Passed explicitly on each batch rather than taken from a viem `chain` object,
 * because this adapter is constructed from a URL and a chain id and has no
 * chain definition to read it from. Without it viem refuses to batch at all,
 * and a routability sweep becomes hundreds of separate round trips against an
 * endpoint that rate-limits.
 */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * The fee tiers to search, cheapest first.
 *
 * All four of Uniswap's, because this chain uses more of them than one would
 * guess: the stable pairs sit at 100, the equities mostly at 500, and a few of
 * the thinner ones only exist at 3000. Searching all four is one `multicall`
 * either way, so there is nothing to save by trimming the list.
 */
const FEE_TIERS = [100, 500, 3000, 10000] as const;

/** Uniswap's own default, and the value every deployed pool here uses. */
const NO_PRICE_LIMIT = 0n;

export interface UniswapV3Options {
	chainId: number;
	rpcUrl: string;
	factory?: Address;
	quoter?: Address;
	router?: Address;
	/** The stable a quote's USD value is read from. Six decimals assumed. */
	quoteAsset?: Address;
	/** The intermediate tried when the direct pair is thin or missing. */
	bridgeAsset?: Address | null;
	/** Priced against `quoteAsset` to turn gas units into dollars. */
	gasAsset?: Address | null;
	/** Multicall3. Defaults to the canonical address, which X Layer has. */
	multicall?: Address;
}

interface PoolCandidate {
	fee: number;
	pool: Address;
}

interface DirectQuote {
	kind: "direct";
	fee: number;
	amountOut: bigint;
	gasEstimate: bigint;
}

interface HopQuote {
	kind: "hop";
	feeIn: number;
	feeOut: number;
	amountOut: bigint;
	gasEstimate: bigint;
}

type RouteCandidate = DirectQuote | HopQuote;

/** What `getRoute` hands back and `buildRoute` must be given untouched. */
export interface UniswapV3RouteSummary {
	chainId: number;
	tokenIn: Address;
	tokenOut: Address;
	amountIn: string;
	amountOut: string;
	route: RouteCandidate;
	bridgeAsset: Address | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class UniswapV3AggregatorClient implements SpotAggregator {
	readonly name = "uniswap-v3";
	readonly chainId: number;

	private readonly client: PublicClient;
	private readonly factory: Address;
	private readonly quoter: Address;
	private readonly router: Address;
	private readonly quoteAsset: Address;
	private readonly bridgeAsset: Address | null;
	private readonly gasAsset: Address | null;
	private readonly multicall: Address;

	/**
	 * The gas token's price, cached for a minute.
	 *
	 * `gasUsd` feeds the basis economics, so it cannot be a guess — but it also
	 * cannot be worth a pool read on every quote during a fourteen-token
	 * routability sweep. A minute is far inside the window where an OKB move
	 * would change a round-trip cost estimate that is already cents.
	 */
	private gasPriceUsd: { value: number; at: number } | null = null;

	constructor(options: UniswapV3Options) {
		this.chainId = options.chainId;
		this.client = createPublicClient({ transport: http(options.rpcUrl) });
		this.factory = getAddress(options.factory ?? XLAYER_UNIV3.factory);
		this.quoter = getAddress(options.quoter ?? XLAYER_UNIV3.quoter);
		this.router = getAddress(options.router ?? XLAYER_UNIV3.router);
		this.quoteAsset = getAddress(options.quoteAsset ?? XLAYER_USDC);
		this.bridgeAsset =
			options.bridgeAsset === null ? null : getAddress(options.bridgeAsset ?? XLAYER_USDG);
		this.gasAsset = options.gasAsset === null ? null : getAddress(options.gasAsset ?? XLAYER_WOKB);
		this.multicall = getAddress(options.multicall ?? MULTICALL3);
	}

	/**
	 * Every pool that exists for a pair and holds anything.
	 *
	 * Existence and liquidity are asked separately because the factory answers
	 * for pools that were created and never funded — a real state on this chain,
	 * where several equities have an empty USDC pool beside a funded USDG one.
	 * Quoting an empty pool is not harmful, it simply reverts, but it wastes the
	 * batch slot that the funded tier needed.
	 */
	private async poolsFor(tokenA: Address, tokenB: Address): Promise<PoolCandidate[]> {
		const addresses = await this.client.multicall({
			multicallAddress: this.multicall,
			allowFailure: true,
			contracts: FEE_TIERS.map((fee) => ({
				address: this.factory,
				abi: factoryAbi,
				functionName: "getPool" as const,
				args: [tokenA, tokenB, fee] as const,
			})),
		});

		const existing: PoolCandidate[] = [];
		for (const [i, result] of addresses.entries()) {
			if (result.status !== "success") continue;
			const pool = result.result as Address;
			if (!pool || /^0x0+$/.test(pool)) continue;
			existing.push({ fee: FEE_TIERS[i] as number, pool: getAddress(pool) });
		}
		if (existing.length === 0) return [];

		const liquidity = await this.client.multicall({
			multicallAddress: this.multicall,
			allowFailure: true,
			contracts: existing.map((candidate) => ({
				address: candidate.pool,
				abi: poolAbi,
				functionName: "liquidity" as const,
			})),
		});

		return existing.filter((_, i) => {
			const result = liquidity[i];
			return result?.status === "success" && (result.result as bigint) > 0n;
		});
	}

	/** Uniswap's packed path: token, fee, token, [fee, token…]. */
	private static path(hops: { token: Address; fee?: number }[]): Hex {
		const types: string[] = [];
		const values: (string | number)[] = [];
		for (const [i, hop] of hops.entries()) {
			types.push("address");
			values.push(hop.token);
			if (i < hops.length - 1) {
				types.push("uint24");
				values.push(hop.fee as number);
			}
		}
		return encodePacked(types, values) as Hex;
	}

	/**
	 * The best fill across every direct pool and every bridged path.
	 *
	 * One batch, not a search: the candidates are enumerable — four fee tiers
	 * direct, and the cross product of tiers on each leg through the bridge — so
	 * they are all quoted at once and compared on what actually arrives. There
	 * is no cleverness to add here, and a sequential version would spend the
	 * chain's rate limit finding the same answer.
	 */
	private async bestRoute(
		tokenIn: Address,
		tokenOut: Address,
		amountIn: bigint,
	): Promise<RouteCandidate | null> {
		const bridge = this.bridgeAsset;
		const usesBridge =
			bridge !== null &&
			bridge.toLowerCase() !== tokenIn.toLowerCase() &&
			bridge.toLowerCase() !== tokenOut.toLowerCase();

		const [direct, legIn, legOut] = await Promise.all([
			this.poolsFor(tokenIn, tokenOut),
			usesBridge ? this.poolsFor(tokenIn, bridge as Address) : Promise.resolve([]),
			usesBridge ? this.poolsFor(bridge as Address, tokenOut) : Promise.resolve([]),
		]);

		const directCalls = direct.map((candidate) => ({
			address: this.quoter,
			abi: quoterAbi,
			functionName: "quoteExactInputSingle" as const,
			args: [
				{
					tokenIn,
					tokenOut,
					amountIn,
					fee: candidate.fee,
					sqrtPriceLimitX96: NO_PRICE_LIMIT,
				},
			] as const,
		}));

		const hops: { feeIn: number; feeOut: number }[] = [];
		for (const a of legIn) for (const b of legOut) hops.push({ feeIn: a.fee, feeOut: b.fee });

		const hopCalls = hops.map((hop) => ({
			address: this.quoter,
			abi: quoterAbi,
			functionName: "quoteExactInput" as const,
			args: [
				UniswapV3AggregatorClient.path([
					{ token: tokenIn, fee: hop.feeIn },
					{ token: bridge as Address, fee: hop.feeOut },
					{ token: tokenOut },
				]),
				amountIn,
			] as const,
		}));

		if (directCalls.length === 0 && hopCalls.length === 0) return null;

		const results = await this.client.multicall({
			multicallAddress: this.multicall,
			allowFailure: true,
			contracts: [...directCalls, ...hopCalls],
		});

		let best: RouteCandidate | null = null;
		const take = (candidate: RouteCandidate) => {
			if (candidate.amountOut <= 0n) return;
			if (best === null || candidate.amountOut > best.amountOut) best = candidate;
		};

		for (const [i, candidate] of direct.entries()) {
			const result = results[i];
			if (result?.status !== "success") continue;
			const [amountOut, , , gasEstimate] = result.result as [bigint, bigint, number, bigint];
			take({ kind: "direct", fee: candidate.fee, amountOut, gasEstimate });
		}
		for (const [i, hop] of hops.entries()) {
			const result = results[direct.length + i];
			if (result?.status !== "success") continue;
			const [amountOut, , , gasEstimate] = result.result as [bigint, bigint[], number[], bigint];
			take({ kind: "hop", feeIn: hop.feeIn, feeOut: hop.feeOut, amountOut, gasEstimate });
		}

		return best;
	}

	/**
	 * What this trade costs against a trade too small to move anything.
	 *
	 * Measured rather than derived from the pool's price. A reference quote of a
	 * thousandth of the size goes through the same tiers and the same fee, so
	 * the ratio between them isolates depth — which is the thing a caller is
	 * asking about — without reimplementing tick maths that would have to agree
	 * exactly with the quoter to be worth anything.
	 *
	 * Negative means worse than the reference, which is the sign convention the
	 * rest of the codebase reads.
	 */
	private async priceImpactPercent(
		tokenIn: Address,
		tokenOut: Address,
		amountIn: bigint,
		amountOut: bigint,
	): Promise<number> {
		const reference = amountIn / 1000n;
		if (reference <= 0n) return 0;
		const small = await this.bestRoute(tokenIn, tokenOut, reference);
		if (!small || small.amountOut <= 0n) return 0;

		const executed = Number(amountOut) / Number(amountIn);
		const mid = Number(small.amountOut) / Number(reference);
		if (!Number.isFinite(executed) || !Number.isFinite(mid) || mid === 0) return 0;
		return (executed / mid - 1) * 100;
	}

	/** The gas token in dollars, from its own pool against the quote asset. */
	private async gasAssetUsd(): Promise<number> {
		if (this.gasAsset === null) return 0;
		const now = Date.now();
		if (this.gasPriceUsd && now - this.gasPriceUsd.at < 60_000) return this.gasPriceUsd.value;

		const route = await this.bestRoute(this.gasAsset, this.quoteAsset, 10n ** 18n).catch(
			() => null,
		);
		// Six decimals on the quote asset, eighteen on the gas token.
		const value = route ? Number(route.amountOut) / 1e6 : 0;
		this.gasPriceUsd = { value, at: now };
		return value;
	}

	async getRoute(request: RouteRequest): Promise<QuoteResult> {
		const tokenIn = getAddress(request.tokenIn);
		const tokenOut = getAddress(request.tokenOut);
		const amountIn = BigInt(request.amountIn);

		const best = await this.bestRoute(tokenIn, tokenOut, amountIn);
		if (!best) {
			return {
				ok: false,
				reason: "no_route",
				message: this.bridgeAsset
					? "No Uniswap V3 pool for this pair, directly or through the chain's bridge asset."
					: "No Uniswap V3 pool for this pair.",
			};
		}

		const [impact, gasAssetUsd, gasPrice] = await Promise.all([
			this.priceImpactPercent(tokenIn, tokenOut, amountIn, best.amountOut),
			this.gasAssetUsd(),
			this.client.getGasPrice().catch(() => 0n),
		]);

		/**
		 * Dollars are only claimed for the side that is actually the stable.
		 *
		 * A buy pays USDC and a sell receives it, so one side of every trade this
		 * app makes has an exact dollar value and the other would need a price
		 * feed. Reporting a made-up number for the far side would be worse than
		 * reporting none: it flows into the basis economics as though measured.
		 */
		const isBuy = tokenIn.toLowerCase() === this.quoteAsset.toLowerCase();
		const isSell = tokenOut.toLowerCase() === this.quoteAsset.toLowerCase();
		const amountInUsd = isBuy ? Number(amountIn) / 1e6 : 0;
		const amountOutUsd = isSell ? Number(best.amountOut) / 1e6 : 0;

		const gasUsd = (Number(best.gasEstimate * gasPrice) / 1e18) * gasAssetUsd;

		const summary: UniswapV3RouteSummary = {
			chainId: this.chainId,
			tokenIn,
			tokenOut,
			amountIn: amountIn.toString(),
			amountOut: best.amountOut.toString(),
			route: best,
			bridgeAsset: this.bridgeAsset,
		};

		const quote: SpotQuote = {
			tokenIn,
			tokenOut,
			amountIn: amountIn.toString(),
			amountOut: best.amountOut.toString(),
			amountInUsd,
			amountOutUsd,
			priceImpactPercent: impact,
			gasUsd: Number.isFinite(gasUsd) ? gasUsd : 0,
			routerAddress: this.router,
			exchanges: ["uniswap-v3"],
			routeSummary: summary,
		};

		return { ok: true, quote };
	}

	/**
	 * Encode the route that was quoted, against the amount it quoted.
	 *
	 * `amountOutMinimum` is derived from the quote rather than re-quoted. A
	 * fresh quote here would drift from the number the caller decided on, and
	 * the floor would then be set against a price nobody agreed to — which is
	 * the one thing slippage protection exists to prevent.
	 */
	async buildRoute(params: {
		routeSummary: unknown;
		sender: Address;
		recipient: Address;
		slippagePercent?: number;
		deadline?: number;
	}): Promise<BuiltSwap> {
		const summary = params.routeSummary as UniswapV3RouteSummary | undefined;
		if (!summary || typeof summary !== "object" || !("route" in summary)) {
			throw new Error("routeSummary is not a Uniswap V3 route from this adapter.");
		}
		if (summary.chainId !== this.chainId) {
			throw new Error(
				`routeSummary is for chain ${summary.chainId}, but this adapter routes ${this.chainId}.`,
			);
		}

		const slippagePercent = params.slippagePercent ?? 0.5;
		const amountIn = BigInt(summary.amountIn);
		const quoted = BigInt(summary.amountOut);
		// Basis points, so a fractional percent survives integer arithmetic.
		const toleranceBps = BigInt(Math.round(slippagePercent * 100));
		const amountOutMinimum = (quoted * (10_000n - toleranceBps)) / 10_000n;

		const recipient = getAddress(params.recipient);
		const route = summary.route;

		/**
		 * Re-checksummed, because this summary has usually been through JSON.
		 *
		 * `getRoute` returns checksummed addresses, but the summary crosses a
		 * process boundary — the API quotes and the agent executes — and viem
		 * rejects a lowercased address when encoding. The failure is at encode
		 * time rather than on chain, so it is loud, but it would only appear on
		 * the path that spends money and never in a local quote.
		 */
		const tokenIn = getAddress(summary.tokenIn);
		const tokenOut = getAddress(summary.tokenOut);
		const bridgeAsset = summary.bridgeAsset ? getAddress(summary.bridgeAsset) : null;

		const data: Hex =
			route.kind === "direct"
				? encodeFunctionData({
						abi: routerAbi,
						functionName: "exactInputSingle",
						args: [
							{
								tokenIn,
								tokenOut,
								fee: route.fee,
								recipient,
								amountIn,
								amountOutMinimum,
								sqrtPriceLimitX96: NO_PRICE_LIMIT,
							},
						],
					})
				: encodeFunctionData({
						abi: routerAbi,
						functionName: "exactInput",
						args: [
							{
								path: UniswapV3AggregatorClient.path([
									{ token: tokenIn, fee: route.feeIn },
									{ token: bridgeAsset as Address, fee: route.feeOut },
									{ token: tokenOut },
								]),
								recipient,
								amountIn,
								amountOutMinimum,
							},
						],
					});

		return {
			// SwapRouter02 pulls the input with `transferFrom`, so the allowance and
			// the call target are the same contract here. They are still reported
			// separately because the interface allows them to differ and LI.FI's do.
			to: this.router,
			routerAddress: this.router,
			data,
			value: "0",
			amountIn: summary.amountIn,
			amountOut: summary.amountOut,
			// The quoter's estimate plus room for the approval-warmed storage the
			// simulation does not see. Callers that estimate for themselves ignore it.
			gas: ((route.gasEstimate * 13n) / 10n).toString(),
		};
	}
}
