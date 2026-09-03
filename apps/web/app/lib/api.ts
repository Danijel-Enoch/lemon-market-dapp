import type { BasisMarket, Candle, SpotQuote } from "@lemon/core";

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

// --- Basis markets --------------------------------------------------------

/** A spot leg the registry holds but no perp hedges yet. */
export interface UnpairedSpotAsset {
	symbol: string;
	ticker: string;
	name: string;
}

/** The board, ranked by net yield after costs. */
export interface BasisMarketList {
	markets: BasisMarket[];
	/** Listed the moment a matching perp exists; the pairing runs per request. */
	unpaired: UnpairedSpotAsset[];
	count: number;
	/** How many of them can actually be entered right now. */
	tradable: number;
	/** False while the first liquidity probe is still running. */
	routabilityKnown: boolean;
}

/**
 * OHLCV for the market chart.
 *
 * `series` is always `perp_mark` today and is sent explicitly rather than
 * implied, because the obvious assumption — that a basis market's chart shows
 * the basis — is the wrong one. No venue publishes a historical price series
 * for a tokenized equity on Base, so there is nothing to difference the perp
 * against.
 */
export interface BasisCandles {
	marketId: string;
	series: "perp_mark";
	symbol: string;
	resolution: string;
	candles: Candle[];
	spotPriceUsd: number | null;
	basisPercent: number | null;
}

export interface BasisPlanResponse {
	marketId: string;
	symbol: string;
	tokenSymbol: string;
	marketSymbol: string;
	buyable: boolean;
	blockers: string[];
	plan: {
		notionalUsd: number;
		spotCostUsd: number;
		perpCollateralUsd: number;
		perpLeverage: number;
		totalCapitalUsd: number;
		netFundingPerHourPercent: number;
		fundingAprPercent: number;
		fundingApyPercent: number;
		roundTripCostUsd: number;
		roundTripCostPercent: number;
		breakevenHours: number | null;
		netApyPercent: number;
		hasPositiveFunding: boolean;
		isNetPositive: boolean;
		warnings: string[];
	};
}

export interface BasisPositionRecord {
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
	realizedPnlUsd: number | null;
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

/**
 * Market ids contain no "/" — they are the underlying ticker — but the API also
 * accepts either leg's symbol, and a perp symbol does. Encoding covers both.
 */
const marketPath = (id: string) => encodeURIComponent(id.replace("/", "-"));

export const basisApi = {
	markets: (assetClass?: "equity" | "crypto") =>
		request<BasisMarketList>("/basis/markets", { query: { assetClass } }),
	market: (id: string) => request<BasisMarket>(`/basis/markets/${marketPath(id)}`),
	candles: (id: string, resolution: string) =>
		request<BasisCandles>(`/basis/markets/${marketPath(id)}/candles`, { query: { resolution } }),

	/** Price a position at real size. Re-quotes both legs; does not commit. */
	plan: (input: { symbol: string; notionalUsd: number; perpLeverage: number }) =>
		post<BasisPlanResponse>("/basis/plan", input),

	positions: (user: string) =>
		request<{ positions: BasisPositionRecord[] }>("/basis/positions", { query: { user } }),
	position: (id: string) =>
		request<{ position: BasisPositionRecord; repairOptions: RepairOption[] }>(
			`/basis/positions/${id}`,
		),
	create: (input: {
		userAddress: string;
		symbol: string;
		notionalUsd: number;
		perpLeverage: number;
	}) => post<BasisPositionRecord>("/basis/positions", input),

	spotFilled: (id: string, input: { txHash: string; shares: number; spotCostUsd: number }) =>
		post<BasisPositionRecord>(`/basis/positions/${id}/spot-filled`, input),
	/**
	 * Open the hedge. The server places it with the session's agent key, so
	 * there is no wallet prompt and nothing to report back afterwards.
	 */
	openPerp: (id: string) => post<BasisPositionRecord>(`/basis/positions/${id}/open-perp`, {}),
	closePerp: (id: string) => post<BasisPositionRecord>(`/basis/positions/${id}/close-perp`, {}),
	legFailed: (id: string, input: { leg: "SPOT" | "PERP"; error: string }) =>
		post<{ position: BasisPositionRecord; repairOptions: RepairOption[] }>(
			`/basis/positions/${id}/leg-failed`,
			input,
		),
	unwind: (id: string) => post<BasisPositionRecord>(`/basis/positions/${id}/unwind`, {}),
	spotClosed: (id: string, input: { txHash: string; proceedsUsd: number }) =>
		post<BasisPositionRecord>(`/basis/positions/${id}/spot-closed`, input),
	closed: (id: string, input: { txHash?: string; trackingId?: string; realizedPnlUsd?: number }) =>
		post<BasisPositionRecord>(`/basis/positions/${id}/closed`, input),
	needsAttention: (user: string) =>
		request<{ positions: { position: BasisPositionRecord; repairOptions: RepairOption[] }[] }>(
			`/basis/positions/attention/${user}`,
		),
};

// --- Spot execution -------------------------------------------------------
//
// The spot leg only. There is no spot trading surface any more — these exist
// so the browser can execute and settle the long half of a basis position.

export type SpotQuoteResult =
	| { ok: true; symbol: string; direction: "buy" | "sell"; quote: SpotQuote; tokenDecimals: number }
	| { ok: false; reason: "no_route"; message: string; symbol: string };

export const spotApi = {
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
};

// --- Points ---------------------------------------------------------------

export interface PointsProfile {
	address: string;
	tier: string;
	rank: number | null;
	spotVolumeUsd: number;
	positionsOpened: number;
	volumePoints: number;
	positionPoints: number;
	total: number;
}

export interface LeaderboardRow {
	rank: number;
	address: string;
	points: number;
	tier: string;
	spotVolumeUsd: number;
	positionsOpened: number;
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
		source: "SPOT_VOLUME";
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

// --- Pacifica account -----------------------------------------------------
//
// Reading and funding only. The venue has no discretionary order endpoints
// here on purpose: Pacifica nets positions per symbol, so a standalone order in
// a symbol the user holds a basis position in would cancel that position's
// short leg while the app went on describing it as hedged.

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
