import type { Candle, MarketWithEconomics, SpotQuote, SpotTokenInfo } from "@lemon/core";

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

/**
 * The Pacifica half of a market.
 *
 * Order sizes are in base units of the asset and must sit on the venue's lot
 * grid, so a form that only knows a USD notional cannot build a valid order —
 * these are the fields that make one possible.
 */
export interface PacificaMarketMeta {
	/** What Pacifica calls this market on the wire, e.g. "BTC". */
	pacificaSymbol: string;
	/** Price increment. Limit prices off this grid are rejected. */
	tickSize: number;
	/** Quantity increment. */
	lotSize: number;
	/** Minimum order value, in USD. */
	minOrderSize: number;
	maxLeverage: number;
	markPrice: number | null;
}

/** A market as the terminal sees it: shared economics plus venue specifics. */
export type TradableMarket = MarketWithEconomics & { pacifica?: PacificaMarketMeta };

export const marketsApi = {
	list: (assetClass?: "equity" | "fx") =>
		request<{ markets: TradableMarket[]; count: number }>("/markets", {
			query: { assetClass },
		}),
	/** Symbols contain "/", which is not URL-path safe — send them as "NVDA-USD". */
	get: (symbol: string) =>
		request<TradableMarket>(`/markets/${encodeURIComponent(symbol.replace("/", "-"))}`),
	candles: (symbol: string, resolution: string) =>
		request<{ symbol: string; resolution: string; candles: Candle[] }>(
			`/markets/${encodeURIComponent(symbol.replace("/", "-"))}/candles`,
			{ query: { resolution } },
		),
	prices: () =>
		request<{ prices: Record<string, { price: number; at: number }> }>("/markets/prices"),
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
	perpSymbol: string;
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
	/**
	 * Open the hedge. The server places it with the session's agent key, so
	 * there is no wallet prompt and nothing to report back afterwards.
	 */
	openPerp: (id: string) => post<CarryPositionRecord>(`/carry/${id}/open-perp`, {}),
	closePerp: (id: string) => post<CarryPositionRecord>(`/carry/${id}/close-perp`, {}),
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

// --- Points ---------------------------------------------------------------

export interface PointsProfile {
	address: string;
	tier: string;
	rank: number | null;
	perpVolumeUsd: number;
	spotVolumeUsd: number;
	carriesOpened: number;
	basketEntries: number;
	perpPoints: number;
	spotPoints: number;
	carryPoints: number;
	basketPoints: number;
	total: number;
}

export interface LeaderboardRow {
	rank: number;
	address: string;
	points: number;
	tier: string;
	spotVolumeUsd: number;
	perpVolumeUsd: number;
	carriesOpened: number;
}

export interface GlobalLeaderboardRow {
	rank: number;
	trader: string;
	volumeUsd: number;
	trades: number;
	winRatePercent: number;
	pnlUsd: number;
}

export const pointsApi = {
	leaderboard: (limit = 100) =>
		request<{ available: boolean; rows: LeaderboardRow[] }>("/points/leaderboard", {
			query: { limit },
		}),
	global: () => request<{ rows: GlobalLeaderboardRow[] }>("/points/global"),
	profile: (address: string) => request<PointsProfile>(`/points/${address}`),
	record: (input: {
		userAddress: string;
		source: "SPOT_VOLUME" | "CARRY_OPENED" | "BASKET_ENTRY";
		volumeUsd?: number;
		txHash: string;
	}) => post<{ awarded: number; duplicate: boolean }>("/points/record", input),
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

// --- Accounts -------------------------------------------------------------

/**
 * What the app knows about a signed-in user.
 *
 * Deliberately small. The derived EVM and Solana wallets that hold the funds
 * are never sent to the browser — the Pacifica account is the only address a
 * user has any reason to see, and showing the others would invite deposits that
 * land outside Pacifica.
 */
export interface AccountSummary {
	/** The connected wallet, lowercased. */
	address: string;
	/** Where positions live. Shown so a user can verify it on-chain. */
	pacificaAccount: string;
	/** True once an agent key is bound — the gate on placing orders. */
	tradingEnabled: boolean;
	activatedAt: string | null;
	/**
	 * True when this app charges a builder fee the user has not approved.
	 *
	 * Their orders still fill — they are simply not attributed — so this is a
	 * prompt, never a block. It happens to anyone who set up their account
	 * before the fee existed, or before it last changed.
	 */
	builderApprovalRequired: boolean;
	/** The fee as a percentage, e.g. "0.1%". Null when none is charged. */
	builderFee: string | null;
}

export interface SessionState {
	available: boolean;
	reason: string | null;
	account: AccountSummary | null;
	/**
	 * The builder fee this deployment charges, as a percentage, or null.
	 *
	 * Present whether or not anyone is signed in, so onboarding can name the fee
	 * up front rather than only once an account exists.
	 */
	builderFee: string | null;
}

export interface Challenge {
	nonce: string;
	message: string;
	expiresAt: string;
}

export const authApi = {
	session: () => request<SessionState>("/auth/session"),
	signInChallenge: (address: string) => post<Challenge>("/auth/sign-in/challenge", { address }),
	signIn: (input: { address: string; nonce: string; signature: string }) =>
		post<{ account: AccountSummary; expiresAt: string }>("/auth/sign-in", input),
	pacificaChallenge: () =>
		post<Challenge & { agentPublicKey: string }>("/auth/pacifica/challenge", {}),
	activatePacifica: (input: { nonce: string; signature: string; agentPublicKey: string }) =>
		post<{ account: AccountSummary }>("/auth/pacifica/activate", input),
	signOut: () => post<{ ok: true }>("/auth/sign-out", {}),
};

// --- Pacifica trading -----------------------------------------------------

export interface PacificaAccountInfo {
	account_equity: string;
	available_to_spend: string;
	available_to_withdraw: string;
	balance: string;
	total_margin_used: string;
	positions_count: number;
	orders_count: number;
}

export interface PacificaPositionRow {
	symbol: string;
	side: "bid" | "ask";
	amount: string;
	entry_price: string;
	margin: string;
	funding: string;
	isolated: boolean;
	created_at: number;
}

export interface PacificaOrderRow {
	order_id: number;
	symbol: string;
	side: "bid" | "ask";
	price: string;
	initial_amount: string;
	filled_amount: string;
	order_type: string;
	reduce_only: boolean;
	created_at: number;
}

export interface PacificaAccountState {
	activated: boolean;
	account: PacificaAccountInfo | null;
	positions: PacificaPositionRow[];
	orders: PacificaOrderRow[];
	/**
	 * USDC that has reached the derived wallet but is not yet a Pacifica
	 * balance. Money in transit between the two halves of a deposit.
	 */
	pendingUsdc: number;
}

export const pacificaApi = {
	account: () => request<PacificaAccountState>("/pacifica/account"),
	marketOrder: (input: {
		symbol: string;
		side: "bid" | "ask";
		amount: string;
		slippagePercent?: string;
		reduceOnly?: boolean;
	}) => post<{ order_id: number }>("/pacifica/orders/market", input),
	limitOrder: (input: {
		symbol: string;
		side: "bid" | "ask";
		amount: string;
		price: string;
		tif?: "GTC" | "IOC" | "ALO";
		reduceOnly?: boolean;
	}) => post<{ order_id: number }>("/pacifica/orders/limit", input),
	cancelOrder: (input: { symbol: string; orderId: number }) =>
		post<{ success: boolean }>("/pacifica/orders/cancel", input),
	closePosition: (input: { symbol: string; slippagePercent?: string }) =>
		post<{ order_id: number }>("/pacifica/positions/close", input),
	setLeverage: (input: { symbol: string; leverage: number }) =>
		post<{ success: boolean }>("/pacifica/leverage", input),
	depositStatus: () =>
		request<{ available: boolean; reason: string | null; pendingUsdc: number }>(
			"/pacifica/deposit/status",
		),
	/**
	 * Start funding. Returns an address to send USDC to; the recipient behind it
	 * is the user's derived Solana wallet, which the browser never learns.
	 */
	fundAddress: (input: { amount: string; originChainId?: number; originCurrency?: string }) =>
		post<{
			requestId: string;
			depositAddress: string;
			amount: string;
			amountFormatted: string;
			destinationAmountFormatted: string;
		}>("/pacifica/fund/address", input),
	fundStatus: (requestId: string) =>
		request<{ status: string; isComplete: boolean; isFailed: boolean }>(
			`/pacifica/fund/status/${requestId}`,
		),
	credit: (amount: number) =>
		post<{ signature: string; amount: number }>("/pacifica/deposit", { amount }),
	withdraw: (amount: number) => post<{ ok: true }>("/pacifica/withdraw", { amount }),
};
