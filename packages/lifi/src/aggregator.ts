import type {
	Address,
	BuiltSwap,
	QuoteResult,
	RouteRequest,
	SpotAggregator,
	SpotQuote,
} from "@lemon/core";
import { requestJson, UpstreamError, XLAYER_CHAIN_ID } from "@lemon/core";
import type { LifiQuote } from "./types";

export const DEFAULT_LIFI_URL = "https://li.quest";

/**
 * The address used to quote when nobody is actually trading.
 *
 * LI.FI's quote endpoint requires a `fromAddress` and builds calldata for it,
 * unlike KyberSwap which quotes anonymously. Routability probes have no sender
 * — they are asking whether a pool exists at all — so they get this. It never
 * signs anything: `buildRoute` takes a real sender and is the only path to a
 * transaction.
 */
const PROBE_SENDER: Address = "0x1111111111111111111111111111111111111111";

/**
 * How bad a direct fill has to be before the bridge-asset hop is even tried.
 *
 * The hop crosses a second pool, so it carries another fee and another spread —
 * on X Layer the USDC to USDG leg alone measured about 0.23%. Below that it
 * cannot win, so quoting it would spend two extra calls to confirm the answer
 * already in hand. Above it, it regularly does win: most of X Layer's markets
 * have no direct USDC pool at all.
 */
const HOP_WORTH_TRYING_PERCENT = 0.3;

/**
 * Global Dollar on X Layer, the chain's other quote asset.
 *
 * Load-bearing, not a detail. X Layer's spot liquidity is split across two
 * stablecoins and neither reaches everything: measured at $5,000, xBTC, xETH,
 * xSOL, wNVDAx, wMUx, wSNDKx, wSKHYx, wSPCXx and wMSTRx route only from USDG,
 * while wGOOGLx, wPLTRx, wHOODx, wTSLAx and wCRCLx route only from USDC. LI.FI
 * will not bridge that gap in one call — asking it for USDC to xETH returns no
 * route even though USDC to USDG and USDG to xETH both quote fine.
 *
 * So the adapter does it: when a direct quote is unavailable or worse, it
 * quotes the hop as well and takes whichever actually fills better. USDC to
 * USDG costs about 0.23%, which is the price of reaching two thirds of the
 * chain's markets.
 */
export const XLAYER_USDG: Address = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";

export interface LifiOptions {
	chainId?: number;
	baseUrl?: string;
	/** Sent as `x-lifi-integrator`; LI.FI uses it for attribution and rate limits. */
	integrator?: string;
	/**
	 * Sent as `x-lifi-api-key`. Strongly recommended in any deployment.
	 *
	 * The unauthenticated tier is tighter than it looks, and this adapter is
	 * unusually expensive against it: the bridge-asset comparison below spends
	 * up to **three** quote calls per route, and the agent quotes once to probe
	 * and again to build. Developing against the free tier will exhaust it, and
	 * LI.FI's answer is a 429 saying "retry in 2 hours" rather than a short
	 * backoff — which for an agent mid-deploy means a position with one leg on.
	 */
	apiKey?: string;
	timeoutMs?: number;
	/**
	 * A stablecoin to try routing through when the direct pair has no pool.
	 *
	 * Defaults to USDG on X Layer and to nothing anywhere else. A chain whose
	 * liquidity is not split does not want an extra probe per trade.
	 */
	bridgeAsset?: Address | null;
}

/**
 * LI.FI, for the chains KyberSwap does not cover.
 *
 * X Layer today. LI.FI reaches it through SushiSwap's aggregator, which is what
 * actually indexes the Uniswap v3 X Layer pools the equities live in — so the
 * depth is real even though LI.FI lists only one DEX for the chain.
 */
export class LifiAggregatorClient implements SpotAggregator {
	readonly name = "lifi";
	readonly chainId: number;
	private readonly baseUrl: string;
	private readonly integrator: string;
	private readonly apiKey: string | null;
	private readonly timeoutMs: number;
	private readonly bridgeAsset: Address | null;

	constructor(options: LifiOptions = {}) {
		this.chainId = options.chainId ?? XLAYER_CHAIN_ID;
		this.baseUrl = options.baseUrl ?? DEFAULT_LIFI_URL;
		this.integrator = options.integrator ?? "lemon-markets";
		this.apiKey = options.apiKey?.trim() || null;
		this.timeoutMs = options.timeoutMs ?? 20_000;
		this.bridgeAsset =
			options.bridgeAsset === undefined
				? this.chainId === XLAYER_CHAIN_ID
					? XLAYER_USDG
					: null
				: options.bridgeAsset;
	}

	private get headers(): Record<string, string> {
		return this.apiKey
			? { "x-lifi-integrator": this.integrator, "x-lifi-api-key": this.apiKey }
			: { "x-lifi-integrator": this.integrator };
	}

	/**
	 * One LI.FI quote, or null when there is no route.
	 *
	 * A 404 from this endpoint means "no available quotes", which is ordinary
	 * market state on a chain where most pairs have no pool. Anything else is a
	 * genuine upstream failure and is raised.
	 */
	private async quoteOnce(params: {
		from: Address;
		to: Address;
		amountIn: string;
		sender: Address;
		slippagePercent: number;
	}): Promise<LifiQuote | null> {
		try {
			return await requestJson<LifiQuote>("lifi", this.baseUrl, "/v1/quote", {
				query: {
					fromChain: String(this.chainId),
					toChain: String(this.chainId),
					fromToken: params.from,
					toToken: params.to,
					fromAmount: params.amountIn,
					fromAddress: params.sender,
					// LI.FI takes a fraction, not a percent or bps.
					slippage: params.slippagePercent / 100,
				},
				headers: this.headers,
				timeoutMs: this.timeoutMs,
			});
		} catch (error) {
			if (error instanceof UpstreamError && error.status === 404) return null;
			throw error;
		}
	}

	/**
	 * The best of the direct route and the route through the bridge asset.
	 *
	 * Both are quoted rather than one being chosen from a table, because which
	 * one works moves with liquidity and a stale table reads as "no route" — the
	 * one failure indistinguishable from the market genuinely being empty. The
	 * comparison is on output value, so the extra hop has to pay for itself.
	 *
	 * The hop is quoted as a *single* LI.FI call from the bridge asset, which
	 * means the returned calldata swaps `bridgeAsset -> tokenOut` and the caller
	 * must already hold the bridge asset. `hop` on the quote says so; the venue
	 * adapter reads it and performs the first leg before the second.
	 */
	async getRoute(request: RouteRequest): Promise<QuoteResult> {
		const sender = request.sender ?? PROBE_SENDER;
		const slippagePercent = request.slippagePercent ?? 0.5;

		const direct = await this.quoteOnce({
			from: request.tokenIn,
			to: request.tokenOut,
			amountIn: request.amountIn,
			sender,
			slippagePercent,
		});

		/**
		 * Only worth two more calls when they might actually win.
		 *
		 * Never when there is no bridge asset, and never when either side already
		 * *is* it — that would quote a token against itself. And not when the
		 * direct route is already good: a hop pays a second pool's fee and
		 * spread, so it cannot beat a direct fill that is only fractionally away
		 * from mid. `HOP_WORTH_TRYING_PERCENT` is where it starts being possible,
		 * and skipping below it cuts the common case from three quote calls to
		 * one — which matters, because LI.FI's rate limit is per call and this
		 * adapter is the heaviest user of it.
		 */
		const directImpact = direct ? impactOf(direct) : null;
		const wantsHop =
			this.bridgeAsset !== null &&
			request.tokenIn.toLowerCase() !== this.bridgeAsset.toLowerCase() &&
			request.tokenOut.toLowerCase() !== this.bridgeAsset.toLowerCase() &&
			(directImpact === null || directImpact < -HOP_WORTH_TRYING_PERCENT);

		const leg1 = wantsHop
			? await this.quoteOnce({
					from: request.tokenIn,
					to: this.bridgeAsset as Address,
					amountIn: request.amountIn,
					sender,
					slippagePercent,
				})
			: null;

		const leg2 = leg1
			? await this.quoteOnce({
					from: this.bridgeAsset as Address,
					to: request.tokenOut,
					amountIn: leg1.estimate.toAmount,
					sender,
					slippagePercent,
				})
			: null;

		const hopped = leg1 && leg2 ? { leg1, leg2 } : null;

		if (!direct && !hopped) {
			return {
				ok: false,
				reason: "no_route",
				message: this.bridgeAsset
					? "No route, directly or through the chain's bridge asset."
					: "No route found for this pair.",
			};
		}

		// Compare on what actually arrives. USD figures are absent on some LI.FI
		// responses, so the raw output amount decides when they are.
		const directOut = direct ? Number(direct.estimate.toAmount) : -1;
		const hoppedOut = hopped ? Number(hopped.leg2.estimate.toAmount) : -1;

		if (hopped && hoppedOut > directOut) {
			return { ok: true, quote: toSpotQuote(hopped.leg2, request, hopped.leg1) };
		}
		// biome-ignore lint/style/noNonNullAssertion: one of the two is non-null above.
		return { ok: true, quote: toSpotQuote(direct!, request) };
	}

	/**
	 * LI.FI returns calldata with the quote, so there is nothing left to encode.
	 *
	 * The `routeSummary` carried through `getRoute` is the quote itself. It is
	 * checked against the sender it was built for rather than trusted: LI.FI
	 * bakes `fromAddress` into the transaction, and executing a probe-built
	 * quote would send a swap whose recipient is an address nobody controls.
	 */
	async buildRoute(params: {
		routeSummary: unknown;
		sender: Address;
		recipient: Address;
		slippagePercent?: number;
	}): Promise<BuiltSwap> {
		const quote = params.routeSummary as LifiQuote | undefined;
		if (!quote?.transactionRequest) {
			throw new Error(
				"This LI.FI quote carries no transaction, so it cannot be executed. Re-quote with a real sender before building.",
			);
		}

		// Re-quoted for the actual sender rather than reusing the probe's
		// calldata. LI.FI's transaction is addressed to whoever asked for it.
		const fresh = await this.quoteOnce({
			from: quote.action.fromToken.address,
			to: quote.action.toToken.address,
			amountIn: quote.action.fromAmount,
			sender: params.sender,
			slippagePercent: params.slippagePercent ?? 0.5,
		});

		if (!fresh?.transactionRequest) {
			throw new Error(
				"LI.FI no longer quotes a route for this pair, so the swap was not built. Nothing was sent.",
			);
		}

		return {
			to: fresh.transactionRequest.to,
			// The approval target, which on LI.FI is not always the `to` of the
			// transaction. Approving `to` instead is the mistake that produces a
			// swap reverting on `transferFrom` with a full allowance in place.
			routerAddress: fresh.estimate.approvalAddress,
			data: fresh.transactionRequest.data,
			value: fresh.transactionRequest.value ?? "0",
			amountIn: fresh.estimate.fromAmount,
			amountOut: fresh.estimate.toAmount,
			gas: fresh.transactionRequest.gasLimit ?? fresh.estimate.gasCosts?.[0]?.estimate ?? "0",
		};
	}
}

/**
 * LI.FI's shape, as the rest of the app expects a quote to look.
 *
 * `hop` is folded into the exchange list rather than added as a field, because
 * every consumer of `SpotQuote` already renders `exchanges` and none of them
 * needs to branch on whether a trade took one pool or two.
 */
/** Price impact as a negative percentage, or null when LI.FI priced neither side. */
function impactOf(quote: LifiQuote): number | null {
	const inUsd = Number(quote.estimate.fromAmountUSD ?? 0);
	const outUsd = Number(quote.estimate.toAmountUSD ?? 0);
	if (!(inUsd > 0) || !(outUsd > 0)) return null;
	return ((outUsd - inUsd) / inUsd) * 100;
}

function toSpotQuote(quote: LifiQuote, request: RouteRequest, leg1?: LifiQuote): SpotQuote {
	const amountInUsd = Number(leg1?.estimate.fromAmountUSD ?? quote.estimate.fromAmountUSD ?? 0);
	const amountOutUsd = Number(quote.estimate.toAmountUSD ?? 0);

	const priceImpactPercent =
		amountInUsd > 0 ? ((amountOutUsd - amountInUsd) / amountInUsd) * 100 : 0;

	const gasUsd = [leg1, quote].reduce(
		(sum, q) => sum + Number(q?.estimate.gasCosts?.[0]?.amountUSD ?? 0),
		0,
	);

	return {
		tokenIn: request.tokenIn,
		tokenOut: request.tokenOut,
		amountIn: leg1?.estimate.fromAmount ?? quote.estimate.fromAmount,
		amountOut: quote.estimate.toAmount,
		amountInUsd,
		amountOutUsd,
		priceImpactPercent,
		routerAddress: quote.estimate.approvalAddress,
		exchanges: [leg1?.toolDetails?.name ?? leg1?.tool, quote.toolDetails?.name ?? quote.tool]
			.filter((name): name is string => Boolean(name))
			.filter((name, i, all) => all.indexOf(name) === i),
		gasUsd,
		routeSummary: quote,
	};
}
