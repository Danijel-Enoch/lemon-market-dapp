/**
 * The vault read API.
 *
 * Everything here is served from the indexer through our own origin, and every
 * figure in it came from a chain event. That is worth being explicit about,
 * because the app makes a strong claim — that a stranger can audit the vaults —
 * and the claim is only true if the app itself is reading the same public data
 * it is pointing people at.
 *
 * Amounts arrive as decimal strings, not numbers. USDC has six decimals and
 * shares have eighteen; a share balance parsed as a float loses precision well
 * before it reaches the screen.
 */

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
	init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
	const { query, ...rest } = init;
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value === undefined || value === "") continue;
		search.set(key, String(value));
	}
	const suffix = search.toString() ? `?${search}` : "";

	const response = await fetch(`${BASE}${path}${suffix}`, {
		...rest,
		credentials: "include",
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Vault {
	address: `0x${string}`;
	marketId: string;
	ticker: string | null;
	name: string;
	symbol: string;
	agentWallet: `0x${string}`;
	tier: "CONSERVATIVE" | "LEVERAGED";
	tierLabel: string;
	leverageLabel: string;
	targetLeverageBps: number;
	maxLeverageBps: number;
	lastObservedLeverageBps: number;

	totalAssets: string;
	totalSupply: string;
	idleAssets: string;
	deployedAssets: string;
	pricePerShare: string;
	depositorCount: number;

	spotTokenSymbol: string | null;
	perpSymbol: string | null;
	agentEnabled: boolean;
	assetClass: string;
	assetClassLabel: string;
	/** One of "crypto" | "stocks" | "rwa" | "fx" — the board's tabs. */
	assetGroup: string;
	paused: boolean;
	emergencyExit: boolean;
	navStale: boolean;
	lastNavReportAt: number | null;

	apy7d?: { apy: number | null; samples: number } | null;
	apy30d?: { apy: number | null; samples: number } | null;
	apyAll?: { apy: number | null; samples: number } | null;
}

export interface Activity {
	id: string;
	vault: `0x${string}`;
	sequence: string;
	kind: number;
	kindLabel: string;
	chain: number;
	chainLabel: string;
	symbol: string;
	baseAmount: string;
	notionalAssets: string;
	pnlAssets: string;
	feeAssets: string;
	txRef: string;
	occurredAt: number;
	reportedAt: number;
	reportTxHash: string;
	explorerUrl: string | null;
	verified: boolean | null;
	verificationNote: string | null;
}

export interface NavPoint {
	timestamp: number;
	pricePerShare: string;
	totalAssets: string;
	deployedAssets: string;
	leverageBps: number;
}

export interface Holding {
	vault: Vault | { address: string };
	shares: string;
	valueUsd: string;
	netDeposited: string;
	depositedTotal: string;
	withdrawnTotal: string;
}

export interface PendingWithdrawal {
	vault: `0x${string}`;
	controller: `0x${string}`;
	pendingShares: string;
	claimableShares: string;
	claimableAssets: string;
	requestedAt: number;
	eligibleAt: number;
	fulfillBy: number;
	fulfilledAt: number | null;
}

export interface LivePosition {
	vault: string;
	wallets: {
		evm: string;
		solana: string | null;
		path: string | null;
		derivationVerified: boolean;
	};
	spot: {
		token: string | null;
		symbol: string | null;
		decimals: number | null;
		balance: string;
		valueUsd: string | null;
		priceUsd: number | null;
	};
	perp: {
		symbol: string | null;
		size: number;
		entryPrice: number | null;
		markPrice: number | null;
		notionalUsd: number | null;
		unrealisedPnlUsd: number | null;
		marginUsd: number | null;
		leverage: number | null;
		fundingRateHourlyPercent: number | null;
	};
	idleAtAgentUsd: string;
	observedValueUsd: string | null;
	reportedDeployedUsd: string;
	discrepancyUsd: string | null;
	notes: string[];
	observedAt: number;
}

export interface AgentTransfer {
	id: string;
	direction: "WITHDRAW" | "RETURN";
	amount: string;
	deployedAfter: string;
	timestamp: number;
	txHash: string;
}

export interface ProtocolStats {
	tvl: string;
	deployed: string;
	idle: string;
	lifetimeDeposited: string;
	/**
	 * Everything below is optional.
	 *
	 * The indexer and the app deploy independently, so a newer app can be handed
	 * an older payload. Marking these optional makes the compiler force a default
	 * at every use, rather than letting a missing field white-screen the page.
	 */
	lifetimeWithdrawn?: string;
	/** Fee shares outstanding, and what they are currently worth. */
	lifetimeFeeShares?: string;
	feeValueUsd?: string;
	/** Notional the agents have traded, and what the venues charged for it. */
	cumulativeNotional?: string;
	cumulativeVenueFees?: string;
	pendingRedeemShares?: string;
	depositors: number;
	activity: number;
	vaultCount: number;
	conservativeCount: number;
	leveragedCount: number;
	queue?: { pending: number; ripe: number; overdue: number };
	staleVaults?: number;
	pausedVaults?: number;
	vaults?: {
		address: string;
		ticker: string | null;
		riskTier: number;
		totalAssets: string;
		pricePerShare: string;
		depositorCount: number;
		apy30d: { apy: number | null; samples: number } | null;
	}[];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const vaultApi = {
	list: () => request<{ vaults: Vault[]; count: number }>("/vaults"),
	get: (address: string) => request<Vault>(`/vaults/${address}`),
	stats: () => request<ProtocolStats>("/vaults/stats"),

	nav: (address: string, days = 30) =>
		request<{ points: NavPoint[] }>(`/vaults/${address}/nav`, { query: { days } }),

	activity: (
		address: string,
		params: { limit?: number; before?: string; kind?: string; chain?: string } = {},
	) =>
		request<{ activity: Activity[]; nextCursor: string | null }>(`/vaults/${address}/activity`, {
			query: params,
		}),

	allActivity: (params: { limit?: number; kind?: string; chain?: string } = {}) =>
		request<{ activity: Activity[]; nextCursor: string | null }>("/vaults/activity", {
			query: params,
		}),

	position: (address: string) => request<LivePosition>(`/vaults/${address}/position`),

	transfers: (address: string) =>
		request<{ transfers: AgentTransfer[] }>(`/vaults/${address}/transfers`),

	portfolio: (owner: string) =>
		request<{
			holdings: Holding[];
			pendingWithdrawals: PendingWithdrawal[];
			history: {
				id: string;
				vault: string;
				direction: string;
				assets: string;
				shares: string;
				timestamp: number;
				txHash: string;
			}[];
		}>(`/vaults/portfolio/${owner}`),

	queue: (vault?: string) =>
		request<{
			now: number;
			ripe: PendingWithdrawal[];
			waiting: PendingWithdrawal[];
			overdue: PendingWithdrawal[];
		}>("/vaults/queue", { query: { vault } }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface VaultableMarket {
	id: string;
	ticker: string;
	name: string;
	assetClass: string;
	netApyPercent: number;
	fundingAprPercent: number;
	blockers: string[];
	spot: {
		symbol: string;
		address: string;
		decimals: number;
		buyable: boolean;
		sellable: boolean;
		probeFailed: boolean;
	};
	perp: { pacificaSymbol: string };
	existing: { conservative: string | null; leveraged: string | null };
	reasons: string[];
	/**
	 * Whether the spot leg can be bought *and* sold on Base right now.
	 *
	 * False means a vault here could not open or could not unwind. A failed
	 * liquidity probe leaves this true rather than false — an unanswered question
	 * is not a "no".
	 */
	spotTradableOnBase: boolean;
}

export interface PreparedVault {
	ticker: string;
	tier: "conservative" | "leveraged";
	marketId: `0x${string}`;
	agentPath: string;
	agentEvmAddress: `0x${string}`;
	agentSolanaAddress: string;
	name: string;
	symbol: string;
	targetLeverageBps: number;
	maxLeverageBps: number;
}

export interface GasBalance {
	chain: "BASE" | "SOLANA";
	address: string | null;
	balance: string | null;
	formatted: string | null;
	symbol: "ETH" | "SOL";
	lowThreshold: string;
	isLow: boolean;
	estimatedTransactions: number | null;
	note: string | null;
}

export interface VaultGas {
	vault: string;
	ticker: string | null;
	base: GasBalance;
	solana: GasBalance;
	needsTopUp: boolean;
}

export interface AgentRun {
	id: string;
	vaultAddress: string;
	action: string;
	rationale: string;
	advised: boolean;
	navReported: boolean;
	activityReported: number;
	fulfilled: number;
	error: string | null;
	createdAt: string;
}

export const adminApi = {
	session: () =>
		request<{ isAdmin: boolean; canCreateVaults: boolean; address?: string }>("/admin/session"),
	markets: () => request<{ markets: VaultableMarket[] }>("/admin/markets"),
	vaults: () =>
		request<{
			vaults: Vault[];
			queue: {
				ripe: PendingWithdrawal[];
				waiting: PendingWithdrawal[];
				overdue: PendingWithdrawal[];
			};
		}>("/admin/vaults"),
	runs: (vault?: string) => request<{ runs: AgentRun[] }>("/admin/runs", { query: { vault } }),
	gas: () => request<{ gas: VaultGas[]; needingTopUp: number }>("/admin/gas"),

	prepare: (body: {
		ticker: string;
		tier: "conservative" | "leveraged";
		targetLeverageBps?: number;
		maxLeverageBps?: number;
	}) => post<PreparedVault>("/admin/vaults/prepare", body),

	record: (body: {
		address: string;
		ticker: string;
		tier: "conservative" | "leveraged";
		spotTokenAddress: string;
		spotTokenDecimals: number;
		spotTokenSymbol: string;
		perpSymbol: string;
		assetClass?: string;
	}) => post<{ vault: unknown }>("/admin/vaults", body),

	setAgent: (address: string, enabled: boolean) =>
		post<{ vault: unknown }>(`/admin/vaults/${address}/agent`, { enabled }),
};

export const authApi = {
	me: () => request<{ account: { address: string; isAdmin: boolean } | null }>("/auth/me"),
	challenge: (address: string) =>
		post<{ nonce: string; message: string }>("/auth/challenge", { address }),
	signIn: (body: { address: string; nonce: string; signature: string }) =>
		post<{ account: { address: string; isAdmin: boolean } }>("/auth/sign-in", body),
	signOut: () => post<{ ok: true }>("/auth/sign-out", {}),
};
