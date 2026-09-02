import type {
	MarketWithEconomics,
	PerpOrder,
	PerpPosition,
	SpotQuote,
	SpotTokenInfo,
} from "@lemon/core";

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(
	path: string,
	init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
	const { query, ...rest } = init;
	const url = new URL(
		`${BASE}${path}`,
		typeof window === "undefined" ? "http://localhost" : window.location.origin,
	);
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value === undefined || value === "") continue;
		url.searchParams.set(key, String(value));
	}

	const response = await fetch(url.pathname + url.search, {
		...rest,
		headers: {
			accept: "application/json",
			...(rest.body ? { "content-type": "application/json" } : {}),
			...rest.headers,
		},
	});

	const text = await response.text();
	const body = text ? JSON.parse(text) : undefined;

	if (!response.ok) {
		throw new ApiError(
			response.status,
			(body as { error?: string })?.error ?? `Request failed (${response.status})`,
			body,
		);
	}
	return body as T;
}

const post = <T>(path: string, body: unknown) =>
	request<T>(path, { method: "POST", body: JSON.stringify(body) });

// --- Markets --------------------------------------------------------------

export const marketsApi = {
	list: (assetClass?: "equity" | "fx") =>
		request<{ markets: MarketWithEconomics[]; count: number }>("/markets", {
			query: { assetClass },
		}),
	/** Symbols contain "/", which is not URL-path safe — send them as "NVDA-USD". */
	get: (symbol: string) =>
		request<MarketWithEconomics>(`/markets/${encodeURIComponent(symbol.replace("/", "-"))}`),
	candles: (symbol: string, resolution: string) =>
		request<{ symbol: string; resolution: string; candles: Candle[] }>(
			`/markets/${encodeURIComponent(symbol.replace("/", "-"))}/candles`,
			{ query: { resolution } },
		),
	prices: () =>
		request<{ prices: Record<string, { price: number; at: number }> }>("/markets/prices"),
};

export interface Candle {
	/** Unix milliseconds. */
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

// --- Perps ----------------------------------------------------------------

export interface IntentPayload {
	intent: string;
	signerRule: string;
	domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
	types: Record<string, { name: string; type: string }[]>;
	primaryType: string;
	message: Record<string, unknown>;
	encodedIntent: `0x${string}`;
}

export interface UnsignedTxPayload {
	to: `0x${string}`;
	data: `0x${string}`;
	value?: string;
	chainId?: number;
}

export type OpenResult =
	| { mode: "intent"; intent: IntentPayload; attributed: boolean }
	/**
	 * `attributed` reports whether a builder-code fee will actually be
	 * collected. It is only ever true on the direct-transaction path: gasless
	 * intents are submitted by the Avantis operator, which builds its own
	 * calldata, so an attribution suffix never reaches the chain.
	 */
	| { mode: "transaction"; tx: UnsignedTxPayload; attributed: boolean };

export interface OpenPerpInput {
	trader: string;
	symbol: string;
	side: "long" | "short";
	collateralUsdc: number;
	leverage: number;
	orderType?: "market" | "limit" | "stop_limit";
	openPrice?: number;
	takeProfit?: number;
	stopLoss?: number;
	slippagePercent?: number;
	gasless?: boolean;
}

export const perpApi = {
	positions: (trader: string) =>
		request<{ positions: PerpPosition[]; orders: PerpOrder[] }>("/perp/positions", {
			query: { trader },
		}),
	allowance: (trader: string) =>
		request<{ data: { allowance: string; balance: string } }>("/perp/allowance", {
			query: { trader },
		}),
	approve: (trader: string, amountUsdc?: number) =>
		post<{ data: UnsignedTxPayload }>("/perp/approve", { trader, amountUsdc }),
	open: (input: OpenPerpInput) => post<OpenResult>("/perp/open", input),
	close: (input: {
		trader: string;
		pairIndex: number;
		index: number;
		collateralToCloseUsdc: number;
		gasless?: boolean;
	}) => post<OpenResult>("/perp/close", input),
	updateLimit: (input: {
		trader: string;
		pairIndex: number;
		index: number;
		openPrice?: number;
		takeProfit?: number;
		stopLoss?: number;
	}) => post<{ data: UnsignedTxPayload }>("/perp/limit/update", input),
	cancelLimit: (input: { trader: string; pairIndex: number; index: number }) =>
		post<{ data: UnsignedTxPayload }>("/perp/limit/cancel", input),
	submit: (input: { orderType: number; encodedIntent: string; signature: string }) =>
		post<{ trackingId?: string; status: string; events: { name: string; payload: unknown }[] }>(
			"/perp/submit",
			input,
		),
};

// --- Spot -----------------------------------------------------------------

export type SpotQuoteResult =
	| { ok: true; symbol: string; direction: "buy" | "sell"; quote: SpotQuote; tokenDecimals: number }
	| { ok: false; reason: "no_route"; message: string; symbol: string };

export interface LimitOrderRecord {
	id: number;
	makerAsset: string;
	takerAsset: string;
	makingAmount: string;
	takingAmount: string;
	filledMakingAmount: string;
	status: string;
	expiredAt: number;
	createdAt: number;
}

export const spotApi = {
	tokens: () =>
		request<{ tokens: SpotTokenInfo[]; count: number; routabilityKnown: boolean }>("/spot/tokens"),
	token: (symbol: string) => request<SpotTokenInfo>(`/spot/tokens/${symbol}`),
	quote: (input: {
		symbol: string;
		direction: "buy" | "sell";
		amount: string;
		slippagePercent?: number;
	}) => request<SpotQuoteResult>("/spot/quote", { query: input }),
	build: (input: {
		routeSummary: unknown;
		sender: string;
		recipient?: string;
		slippagePercent?: number;
		permit?: string;
	}) =>
		post<{ data: `0x${string}`; routerAddress: `0x${string}`; amountOut: string; gasUsd: string }>(
			"/spot/build",
			input,
		),
	limitContract: () => request<{ address: `0x${string}` }>("/spot/limit/contract"),
	limitOrders: (maker: string, status: "active" | "filled" | "cancelled" = "active") =>
		request<{ orders: LimitOrderRecord[] }>("/spot/limit/orders", { query: { maker, status } }),
	requiredAllowance: (input: { maker: string; symbol: string; additionalAmount?: string }) =>
		request<{
			makerAsset: `0x${string}`;
			spender: `0x${string}`;
			activeMakingAmount: string;
			requiredAllowance: string;
		}>("/spot/limit/required-allowance", { query: input }),
	limitSignMessage: (input: {
		maker: string;
		symbol: string;
		direction: "buy" | "sell";
		shares: string;
		limitPrice: string;
		expiredAt: number;
	}) =>
		post<{
			input: Record<string, unknown>;
			signMessage: {
				domain: Record<string, unknown>;
				types: Record<string, { name: string; type: string }[]>;
				message: Record<string, unknown> & { salt: string };
				primaryType?: string;
			};
		}>("/spot/limit/sign-message", input),
	submitLimitOrder: (input: { input: unknown; salt: string; signature: string }) =>
		post<{ id: number }>("/spot/limit/orders", input),
	cancelLimitSign: (input: { maker: string; orderIds: number[] }) =>
		post<{
			domain: Record<string, unknown>;
			types: Record<string, { name: string; type: string }[]>;
			message: Record<string, unknown>;
			primaryType?: string;
		}>("/spot/limit/cancel-sign", input),
	cancelLimit: (input: { maker: string; orderIds: number[]; signature: string }) =>
		post<unknown>("/spot/limit/cancel", input),
};

// --- Baskets --------------------------------------------------------------

export interface BasketLegStatus {
	marketSymbol: string;
	ticker: string;
	pairIndex: number | null;
	logoUrl: string | null;
	maxLeverage: number;
	minPositionUsdc: number;
	isOpen: boolean;
	perpAvailable: boolean;
	spotAvailable: boolean;
	spotPending: boolean;
	spotSymbol: string | null;
	fundingShortPercentPerHour: number;
}

export interface BasketSummary {
	id: string;
	name: string;
	description: string;
	assetClass: "crypto" | "equity";
	legs: BasketLegStatus[];
	perpLegCount: number;
	spotLegCount: number;
	legsMatch: boolean;
	perpOnlyTickers: string[];
	routabilityKnown: boolean;
}

export interface BasketPlanLeg {
	marketSymbol: string;
	ticker: string;
	spotSymbol: string | null;
	notionalUsd: number;
	collateralUsd: number;
	tradable: boolean;
	reason: string | null;
}

export interface BasketPlan {
	basketId: string;
	venue: "perp" | "spot";
	totalUsd: number;
	leverage: number;
	legs: BasketPlanLeg[];
	tradableLegs: number;
	effectiveUsd: number;
	warnings: string[];
}

export const basketApi = {
	list: () => request<{ baskets: BasketSummary[] }>("/baskets"),
	get: (id: string) => request<BasketSummary>(`/baskets/${id}`),
	candles: (id: string, resolution: string) =>
		request<{
			basketId: string;
			resolution: string;
			points: { time: number; value: number }[];
			changePercent: number;
			included: string[];
			missing: string[];
		}>(`/baskets/${id}/candles`, { query: { resolution } }),
	plan: (id: string, input: { venue: "perp" | "spot"; totalUsd: number; leverage?: number }) =>
		post<BasketPlan>(`/baskets/${id}/plan`, input),
};

// --- Cash & carry ---------------------------------------------------------

export interface CarryPlanResponse {
	symbol: string;
	tokenSymbol: string;
	marketSymbol: string;
	pairIndex: number;
	buyable: boolean;
	blockers: string[];
	plan: {
		notionalUsd: number;
		spotCostUsd: number;
		perpCollateralUsd: number;
		perpLeverage: number;
		totalCapitalUsd: number;
		netFundingPerHourPercent: number;
		fundingApyPercent: number;
		roundTripCostUsd: number;
		breakevenHours: number | null;
		netApyPercent: number;
		hasPositiveFunding: boolean;
		isNetPositive: boolean;
		warnings: string[];
	};
}

export interface CarryPositionRecord {
	id: string;
	userAddress: string;
	tokenSymbol: string;
	avantisPairIndex: number;
	avantisSymbol: string;
	status:
		| "VALIDATING"
		| "SPOT_FILLED"
		| "OPEN"
		| "UNWINDING"
		| "SPOT_CLOSED"
		| "CLOSED"
		| "ORPHANED"
		| "FAILED";
	notionalUsd: number;
	shares: number | null;
	spotCostUsd: number | null;
	perpCollateralUsd: number;
	perpLeverage: number;
	entryFundingRatePct: number | null;
	entryNetApyPct: number | null;
	perpTradeIndex: number | null;
	perpOpenTimestamp: number | null;
	spotBuyTxHash: string | null;
	perpOpenTxHash: string | null;
	spotSellTxHash: string | null;
	perpCloseTxHash: string | null;
	failureReason: string | null;
	openedAt: string | null;
	closedAt: string | null;
	createdAt: string;
}

export interface RepairOption {
	action: "retry_perp" | "unwind_spot" | "close_perp";
	label: string;
	description: string;
}

export const carryApi = {
	candidates: () =>
		request<{
			candidates: {
				symbol: string;
				name: string;
				marketSymbol: string;
				pairIndex: number;
				maxLeverage: number;
				minPositionUsdc: number;
				isOpen: boolean;
			}[];
			unavailable: { symbol: string; reason: string }[];
		}>("/carry/candidates"),
	plan: (input: { symbol: string; notionalUsd: number; perpLeverage: number }) =>
		post<CarryPlanResponse>("/carry/plan", input),
	list: (user: string) =>
		request<{ positions: CarryPositionRecord[] }>("/carry", { query: { user } }),
	get: (id: string) =>
		request<{ position: CarryPositionRecord; repairOptions: RepairOption[] }>(`/carry/${id}`),
	create: (input: {
		userAddress: string;
		symbol: string;
		notionalUsd: number;
		perpLeverage: number;
	}) => post<CarryPositionRecord>("/carry", input),
	spotFilled: (id: string, input: { txHash: string; shares: number; spotCostUsd: number }) =>
		post<CarryPositionRecord>(`/carry/${id}/spot-filled`, input),
	perpOpened: (
		id: string,
		input: { txHash?: string; trackingId?: string; tradeIndex: number; openTimestamp: number },
	) => post<CarryPositionRecord>(`/carry/${id}/perp-opened`, input),
	legFailed: (id: string, input: { leg: "SPOT" | "PERP"; error: string }) =>
		post<{ position: CarryPositionRecord; repairOptions: RepairOption[] }>(
			`/carry/${id}/leg-failed`,
			input,
		),
	unwind: (id: string) => post<CarryPositionRecord>(`/carry/${id}/unwind`, {}),
	spotClosed: (id: string, input: { txHash: string; proceedsUsd: number }) =>
		post<CarryPositionRecord>(`/carry/${id}/spot-closed`, input),
	closed: (id: string, input: { txHash?: string; trackingId?: string; realizedPnlUsd?: number }) =>
		post<CarryPositionRecord>(`/carry/${id}/closed`, input),
	needsAttention: (user: string) =>
		request<{ positions: { position: CarryPositionRecord; repairOptions: RepairOption[] }[] }>(
			`/carry/attention/${user}`,
		),
};

// --- Deposits -------------------------------------------------------------

export const depositApi = {
	status: () => request<{ available: boolean; reason: string | null }>("/deposit/status"),
	chains: () =>
		request<{
			chains: {
				id: number;
				name: string;
				vmType?: string;
				currencies: { symbol: string; address: string; decimals: number }[];
			}[];
		}>("/deposit/chains"),
	createAddress: (input: {
		recipient: string;
		originChainId: number;
		originCurrency: string;
		amount: string;
	}) =>
		post<{
			requestId: string;
			depositAddress: string;
			amount: string;
			amountFormatted: string;
			originSymbol: string;
			destinationAmountFormatted: string;
		}>("/deposit/address", input),
	depositStatus: (requestId: string) =>
		request<{
			status: string;
			isComplete: boolean;
			isFailed: boolean;
			inTxHashes: string[];
			outTxHashes: string[];
		}>(`/deposit/status/${requestId}`),
	history: (user: string) =>
		request<{ deposits: Record<string, unknown>[] }>("/deposit/history", { query: { user } }),
};
