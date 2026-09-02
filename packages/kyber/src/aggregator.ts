import type { Address, Hex, SpotQuote } from "@lemon/core";
import { percentToBps, requestJson, UpstreamError } from "@lemon/core";
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

export interface AggregatorOptions {
	baseUrl?: string;
	/** Sent as `x-client-id`; KyberSwap uses it for rate limiting and attribution. */
	clientId?: string;
	chainSlug?: string;
	timeoutMs?: number;
}

export interface RouteRequest {
	tokenIn: Address;
	tokenOut: Address;
	/** Base units of `tokenIn`. */
	amountIn: string;
	slippagePercent?: number;
}

/**
 * A quote result that distinguishes "no pool exists" from "the request failed".
 *
 * This matters because most of the tokenized stocks currently have no Aerodrome
 * pool at all, and showing that as an error would be wrong — it is ordinary
 * market state that the UI should render as an empty state.
 */
export type QuoteResult =
	| { ok: true; quote: SpotQuote }
	| { ok: false; reason: "no_route"; message: string };

export class KyberAggregatorClient {
	private readonly baseUrl: string;
	private readonly clientId: string;
	private readonly chainSlug: string;
	private readonly timeoutMs: number;

	constructor(options: AggregatorOptions = {}) {
		this.baseUrl = options.baseUrl ?? DEFAULT_AGGREGATOR_URL;
		this.clientId = options.clientId ?? "lemon-markets";
		this.chainSlug = options.chainSlug ?? BASE_CHAIN_SLUG;
		this.timeoutMs = options.timeoutMs ?? 20_000;
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
	}): Promise<BuildRouteData> {
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
		return response.data;
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
