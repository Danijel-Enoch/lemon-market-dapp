import type {
	Address,
	BuiltSwap,
	ChainId,
	Hex,
	QuoteResult,
	RouteRequest,
	SpotAggregator,
	SpotQuote,
} from "@lemon/core";
import {
	ARBITRUM_CHAIN_ID,
	BASE_CHAIN_ID,
	percentToBps,
	requestJson,
	type SpotFeeConfig,
	UpstreamError,
} from "@lemon/core";
import {
	type BuildRouteData,
	type GetRouteData,
	KYBER_ROUTE_NOT_FOUND,
	type KyberEnvelope,
	type RouteSummary,
} from "./types";

export const DEFAULT_AGGREGATOR_URL = "https://aggregator-api.kyberswap.com";
/** KyberSwap's chain slug for Base. The aggregator is EVM-only. */
export const BASE_CHAIN_SLUG = "base";

/**
 * The chains KyberSwap covers *and this app trades on*.
 *
 * Deliberately not every chain KyberSwap supports. X Layer is the absent one
 * and the reason this map exists: KyberSwap has no X Layer deployment, so an
 * X Layer vault routed here would get a 404 from a URL built out of a slug that
 * does not exist. Naming the covered chains explicitly turns that into a
 * constructor error at boot instead of a failed trade at the first deploy.
 */
export const KYBER_CHAIN_SLUGS: Partial<Record<ChainId, string>> = {
	[BASE_CHAIN_ID]: "base",
	[ARBITRUM_CHAIN_ID]: "arbitrum",
};

export function kyberCovers(chainId: number): boolean {
	return Boolean(KYBER_CHAIN_SLUGS[chainId as ChainId]);
}

export interface AggregatorOptions {
	/**
	 * Which chain this client routes on.
	 *
	 * Defaults to Base so existing call sites keep their meaning. A chain
	 * KyberSwap does not cover throws here rather than at trade time — see
	 * `KYBER_CHAIN_SLUGS`.
	 */
	chainId?: number;
	baseUrl?: string;
	/** Sent as `x-client-id`; KyberSwap uses it for rate limiting and attribution. */
	clientId?: string;
	chainSlug?: string;
	timeoutMs?: number;
	/**
	 * Integrator fee taken inside the swap.
	 *
	 * Applied at quote time so the amount the user is shown is already net of
	 * it — quoting without the fee and charging it later would mean every
	 * displayed output was optimistic.
	 */
	fee?: SpotFeeConfig | null;
}

/**
 * `RouteRequest` and `QuoteResult` moved to `@lemon/core`.
 *
 * They describe every aggregator, not KyberSwap's in particular — LI.FI returns
 * the same two shapes — and leaving a second definition here would make the two
 * drift. Re-exported so the existing importers do not have to change.
 */
export type { QuoteResult, RouteRequest } from "@lemon/core";

export class KyberAggregatorClient implements SpotAggregator {
	readonly name = "kyberswap";
	readonly chainId: number;
	private readonly baseUrl: string;
	private readonly clientId: string;
	private readonly chainSlug: string;
	private readonly timeoutMs: number;
	private readonly fee: SpotFeeConfig | null;

	constructor(options: AggregatorOptions = {}) {
		this.chainId = options.chainId ?? BASE_CHAIN_ID;

		const slug = options.chainSlug ?? KYBER_CHAIN_SLUGS[this.chainId as ChainId];
		if (!slug) {
			throw new Error(
				`KyberSwap does not cover chain ${this.chainId}. Use an aggregator that does — X Layer is served by LI.FI.`,
			);
		}

		this.baseUrl = options.baseUrl ?? DEFAULT_AGGREGATOR_URL;
		this.clientId = options.clientId ?? "lemon-markets";
		this.chainSlug = slug;
		this.timeoutMs = options.timeoutMs ?? 20_000;
		this.fee = options.fee?.bps ? options.fee : null;
	}

	/** Fee query params, omitted entirely when no fee is configured. */
	private feeParams() {
		if (!this.fee) return {};
		return {
			feeAmount: this.fee.bps,
			// `isInBps` is what makes feeAmount a rate rather than a raw amount.
			isInBps: true,
			chargeFeeBy: this.fee.chargeBy,
			feeReceiver: this.fee.receiver,
		};
	}

	private get headers() {
		return { "x-client-id": this.clientId };
	}

	/** Step 1: find the best route. Returns `no_route` rather than throwing. */
	async getRoute(request: RouteRequest): Promise<QuoteResult> {
		let response: KyberEnvelope<GetRouteData>;
		try {
			response = await requestJson<KyberEnvelope<GetRouteData>>(
				"kyberswap",
				this.baseUrl,
				`/${this.chainSlug}/api/v1/routes`,
				{
					query: {
						tokenIn: request.tokenIn,
						tokenOut: request.tokenOut,
						amountIn: request.amountIn,
						slippageTolerance: request.slippagePercent
							? percentToBps(request.slippagePercent)
							: undefined,
						...this.feeParams(),
					},
					headers: this.headers,
					timeoutMs: this.timeoutMs,
				},
			);
		} catch (error) {
			// A route-not-found can surface as a non-2xx depending on gateway.
			if (error instanceof UpstreamError && isRouteNotFound(error.body)) {
				return { ok: false, reason: "no_route", message: "No route found for this pair." };
			}
			throw error;
		}

		if (response.code === KYBER_ROUTE_NOT_FOUND) {
			return { ok: false, reason: "no_route", message: response.message || "No route found." };
		}
		if (response.code !== 0 || !response.data?.routeSummary) {
			throw new UpstreamError("kyberswap", 200, `kyberswap: ${response.message}`, response);
		}

		return { ok: true, quote: toSpotQuote(response.data) };
	}

	/**
	 * Step 2: encode the route into calldata.
	 *
	 * `routeSummary` must be passed back exactly as received — it is an opaque
	 * server-signed payload, and mutating any field invalidates the quote.
	 */
	async buildRoute(params: {
		routeSummary: unknown;
		sender: Address;
		recipient: Address;
		slippagePercent?: number;
		deadline?: number;
		/** Encoded permit calldata, to skip a separate approval transaction. */
		permit?: Hex;
		source?: string;
	}): Promise<BuiltSwap> {
		const response = await requestJson<KyberEnvelope<BuildRouteData>>(
			"kyberswap",
			this.baseUrl,
			`/${this.chainSlug}/api/v1/route/build`,
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: {
					routeSummary: params.routeSummary,
					sender: params.sender,
					recipient: params.recipient,
					slippageTolerance: percentToBps(params.slippagePercent ?? 0.5),
					deadline: params.deadline,
					permit: params.permit,
					source: params.source ?? "lemon-markets",
				},
			},
		);

		if (response.code !== 0 || !response.data?.data) {
			throw new UpstreamError("kyberswap", 200, `kyberswap: ${response.message}`, response);
		}

		const built = response.data;
		return {
			// KyberSwap encodes a call to its own router, so the transaction target
			// and the allowance holder are the same contract. Stated rather than
			// omitted because `BuiltSwap` also carries LI.FI, where they differ.
			to: built.routerAddress,
			routerAddress: built.routerAddress,
			data: built.data,
			// Always an ERC-20 swap here: the vault's asset is USDC and the spot
			// legs are ERC-20s, so no native value is ever attached. Stated rather
			// than omitted because `BuiltSwap` is shared with LI.FI, where a native
			// leg is possible and the field is not always "0".
			value: "0",
			amountIn: built.amountIn,
			amountOut: built.amountOut,
			gas: built.gas,
		};
	}
}

function isRouteNotFound(body: unknown): boolean {
	return (
		typeof body === "object" &&
		body !== null &&
		(body as { code?: number }).code === KYBER_ROUTE_NOT_FOUND
	);
}

function toSpotQuote(data: GetRouteData): SpotQuote {
	const summary: RouteSummary = data.routeSummary;
	const amountInUsd = Number(summary.amountInUsd);
	const amountOutUsd = Number(summary.amountOutUsd);

	// Impact is negative when the trade loses value crossing the pool.
	const priceImpactPercent =
		amountInUsd > 0 ? ((amountOutUsd - amountInUsd) / amountInUsd) * 100 : 0;

	const exchanges = Array.from(
		new Set(
			summary.route
				.flat()
				.map((hop) => hop.exchange)
				.filter(Boolean),
		),
	);

	return {
		tokenIn: summary.tokenIn,
		tokenOut: summary.tokenOut,
		amountIn: summary.amountIn,
		amountOut: summary.amountOut,
		amountInUsd,
		amountOutUsd,
		priceImpactPercent,
		gasUsd: Number(summary.gasUsd) || 0,
		routerAddress: data.routerAddress,
		exchanges,
		routeSummary: summary,
	};
}
