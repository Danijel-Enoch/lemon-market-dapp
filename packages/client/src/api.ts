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

/**
 * PUT, for the one endpoint that genuinely replaces a whole collection.
 *
 * A vault's market list is set as a set rather than a market at a time, because
 * the target weights only mean anything together — so the verb that says
 * "this is the collection now" is the honest one.
 */
const put = <T>(path: string, body: unknown) =>
	request<T>(path, { method: "PUT", body: JSON.stringify(body) });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One market a vault runs a basis position in.
 *
 * A vault used to be one market by construction, and on-chain it still looks
 * like one — `marketId` is set in the constructor and never changes. That was
 * always a label rather than a constraint: the contract holds USDC, bounds what
 * the agent may withdraw, and checks the leverage it reports, and none of that
 * is per-market. Which markets the capital is spread across is decided off-chain.
 */
export interface VaultMarket {
	ticker: string;
	spotTokenSymbol: string;
	spotTokenAddress: string;
	perpSymbol: string;
	/** Share of the vault's spot notional this market should carry, in bps. */
	targetWeightBps: number;
	/**
	 * False for a market an operator has retired. It keeps its row because the
	 * vault may still hold a position in it — which the agent has to be able to
	 * see, value and sell — but no new capital goes into it.
	 */
	enabled: boolean;
}

export interface Vault {
	address: `0x${string}`;
	/**
	 * The chain this vault custodies on.
	 *
	 * Optional because an API built before multi-chain serves rows without it,
	 * and those rows are Base vaults. Callers that act on it should read it as
	 * `vault.chainId ?? APP_CHAIN.id` rather than asserting — a deployment can
	 * run a newer browser bundle against an older API for the length of a
	 * rollout.
	 */
	chainId?: number;
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

	/**
	 * Every funding payment this vault has been paid, added up. USDC, signed.
	 *
	 * What a basis vault is for, and the one figure that says how much of it has
	 * actually happened rather than what it would pay if the rate held. Gross:
	 * before management, performance and venue fees, so it is what the strategy
	 * earned and not what a depositor kept — `pricePerShare` is still the only
	 * answer to that.
	 *
	 * Signed, because a period of negative funding is a period the vault paid.
	 * Optional because it accrues from the point the agent began reporting
	 * settlements; a vault indexed before that has none, which is not zero.
	 */
	cumulativeFunding?: string | null;
	/** Settlements behind the total, so it can say what it averages over. */
	fundingSettlementCount?: number | null;
	/** The earliest settlement counted, as a unix timestamp. */
	firstFundingAt?: number | null;

	/** The founding market. `markets[0]` says the same thing properly. */
	spotTokenSymbol: string | null;
	perpSymbol: string | null;
	/** Every market this vault runs, enabled first and heaviest first. */
	markets: VaultMarket[];
	agentEnabled: boolean;
	/**
	 * Set while an operator has ordered every position closed and the capital
	 * returned; `closeCompletedAt` is when the agent first found the vault flat.
	 * Both null in the ordinary case.
	 */
	closeRequestedAt: string | null;
	closeCompletedAt: string | null;

	/** A hand-asked rebalance: when it was asked for, and what became of it. */
	rebalanceRequestedAt: string | null;
	rebalanceCompletedAt: string | null;
	/** The answer, including when the answer is "the venue would not take it". */
	rebalanceOutcome: string | null;
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

	/** Forward-looking yield from the current funding rate, or why there is none. */
	outlook: VaultOutlook;
}

/**
 * What a vault would pay if today's funding rate held.
 *
 * A union rather than a nullable number, so the UI cannot render a figure
 * without the label that says it is a projection, and always has something to
 * put in the slot when there is no figure. Every field is annualised percent
 * unless it says otherwise.
 */
export type VaultOutlook =
	| {
			available: true;
			observedAt: number;
			/** Short-side funding, percent per hour, as the venue quotes it. */
			fundingShortPercentPerHour: number;
			/** That rate annualised, on notional. The biggest number here, and not the one to show. */
			fundingAprPercent: number;
			/** Funding measured against the capital that has to be posted for it. */
			grossApyPercent: number;
			/** After the idle buffer the vault keeps for its redemption queue. */
			afterBufferApyPercent: number;
			/** After the venue round trip. */
			afterCostsApyPercent: number;
			/** After the streaming management fee. */
			afterManagementApyPercent: number;
			/** What a depositor keeps. The one to show. */
			netApyPercent: number;
			roundTripDragPercent: number;
			managementFeePercent: number;
			performanceFeeDragPercent: number;
			breakevenDays: number | null;
			fundingPositive: boolean;
			assumptions: {
				leverage: number;
				deployedFraction: number;
				managementFeeBps: number;
				performanceFeeBps: number;
				roundTripsPerYear: number;
				spotImpactPercent: number;
			};
	  }
	| { available: false; reason: string };

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

/** One UTC day's funding. Every day in the window is present, paid or not. */
export interface FundingPoint {
	/** Unix seconds at the start of the bucket — not a settlement time. */
	start: number;
	/** @deprecated Read `start`. Identical value, kept for older bundles. */
	day: number;
	/** Funding paid that day, signed USDC. Zero on a day with no settlements. */
	amount: string;
	/** How many settlements made it up. Zero means the vault was not paid. */
	settlements: number;
	/** Running total from the start of the window, not from the vault's first day. */
	cumulative: string;
}

export interface FundingSeries {
	points: FundingPoint[];
	/** Today so far, in UTC. Partial by construction until the day closes. */
	today: string;
	todaySettlements: number;
	/** The window's total. The lifetime figure is `Vault.cumulativeFunding`. */
	windowTotal: string;
	settlements: number;
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

/** How near the front of the venue's auto-deleveraging queue a position sits. */
export type AdlBand = "none" | "low" | "elevated" | "high" | "severe" | "critical";

/**
 * Auto-deleveraging exposure for the perp leg.
 *
 * Mirrors `AdlRisk` in `@lemon/core`, where the model and its reasoning live.
 * The short one of these describes is only eligible for auto-deleveraging while
 * it is *winning* — which for a short means the price has fallen, which is also
 * what liquidates the longs whose bankruptcy triggers ADL. So the venue takes
 * the hedge away exactly when the spot leg is down and the hedge was doing its
 * job. That is what this object exists to make visible.
 *
 * `score` ranks against the rest of the book, and the rest of the book is not
 * visible. Read it as exposure, never as a probability.
 */
export interface AdlRisk {
	eligible: boolean;
	score: number;
	/** 0–5. Zero means not in the queue at all. */
	lamps: number;
	band: AdlBand;
	profitPercent: number;
	effectiveLeverage: number | null;
	/** Further move, as a percent of mark, before the next band. */
	headroomPercent: number | null;
	nextBand: AdlBand | null;
	/** False when no price reaches the next band — see the core model. */
	nextBandReachable: boolean;
	stress: {
		markVsOraclePercent: number | null;
		change24hPercent: number | null;
	};
	summary: string;
}

/**
 * Why a market's hedge is or is not being corrected right now.
 *
 * Mirrors `RebalanceStatus` in the API, where the reasoning lives. The two
 * blocked states are the ones worth knowing: past the threshold, and the venue
 * will not take the order that would close it. Neither is an error — they say
 * the legs are already as close as this market allows — so a UI that paints
 * them red is telling the reader the wrong thing.
 */
export type RebalanceStatus =
	| "neutral"
	| "ready"
	| "below-lot-size"
	| "below-min-notional"
	| "unknown";

/**
 * One market's hedge, and how far its two legs have drifted apart.
 *
 * Measured in units of the underlying rather than in dollars: a basis position
 * is neutral when it is long and short the same number of units, and that holds
 * at any price. Per market, because two markets a percent out in opposite
 * directions average to neutral and are both wrong.
 */
export interface MarketHedge {
	ticker: string;
	spotSymbol: string;
	spotTokenAddress: string;
	perpSymbol: string;
	spotUnits: number;
	perpUnits: number;
	markPrice: number | null;
	/** Signed unit gap. Positive is under-hedged, negative is over-hedged. */
	deltaUnits: number;
	driftPercent: number;
	deltaUsd: number | null;
	/** Judged against this vault's threshold, not against the sign alone. */
	exposure: "neutral" | "long" | "short";
	rebalanceDriftBps: number;
	thresholdPercent: number;
	/** The venue's quantity increment, in units of the underlying. */
	lotSize: number | null;
	/** The venue's minimum order value in **USD** — not comparable to `lotSize`. */
	minOrderUsd: number | null;
	correctionUnits: number;
	/** What the correction is worth, which is what the venue's minimum is checked against. */
	correctionUsd: number | null;
	status: RebalanceStatus;
}

export interface LivePosition {
	vault: string;
	/** The chain the vault custodies on. Explorer links are built from it. */
	chainId: number;
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
		adl: AdlRisk;
	};
	/**
	 * Every enabled market's hedge, worst drift first.
	 *
	 * Optional because the app and the API deploy independently: an older API
	 * answers without it, and a page that assumed it was there would white-screen
	 * rather than simply not render the block.
	 */
	markets?: MarketHedge[];
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

	/**
	 * Funding paid, bucketed by day or — with `hours` — by hour.
	 *
	 * The venue settles hourly, so hours is the finer of the two real views and
	 * days is the summary. Passing `hours` picks both the window and the bucket;
	 * see the indexer route for why they are not separate knobs.
	 */
	funding: (address: string, window: { days?: number; hours?: number } = {}) =>
		request<FundingSeries>(`/vaults/${address}/funding`, {
			query: window.hours ? { hours: window.hours } : { days: window.days ?? 30 },
		}),

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
				/** The chain the flow happened on. A portfolio spans chains by nature. */
				chainId?: number;
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
		/** When routability was last checked, or null if it never has been. */
		checkedAt: number | null;
	};
	perp: { pacificaSymbol: string };
	existing: { conservative: string | null; leveraged: string | null };
	reasons: string[];
	/**
	 * Whether the spot leg can be bought *and* sold on the board's chain.
	 *
	 * False means a vault here could not open or could not unwind. A failed
	 * liquidity probe leaves this true rather than false — an unanswered question
	 * is not a "no".
	 */
	spotTradable: boolean;
}

export interface PreparedVault {
	ticker: string;
	tier: "conservative" | "leveraged";
	/** The chain the vault will be deployed on. Already baked into `agentPath`. */
	chainId: number;
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
	/**
	 * "EVM" for the vault's own chain, "SOLANA" for the perp venue's.
	 *
	 * Was `"BASE"` — a chain name, which stopped being accurate once a vault
	 * could custody elsewhere. This says which of the agent's two wallets;
	 * `chainId` says which EVM chain.
	 */
	chain: "EVM" | "SOLANA";
	/** The EVM chain. Null on the Solana row. */
	chainId: number | null;
	/** As a person would say it — "Base", "Arbitrum One", "X Layer", "Solana". */
	chainName: string;
	address: string | null;
	balance: string | null;
	formatted: string | null;
	/** The chain's native unit. X Layer charges gas in OKB, not ETH. */
	symbol: "ETH" | "OKB" | "SOL";
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

/**
 * What an agent wallet could send back, net of the fee for sending it.
 *
 * Lower than the balance on the gas panel by exactly the cost of the transfer,
 * which is the point: "withdraw everything" has to mean a number the operator
 * was shown rather than one computed after they clicked.
 */
export interface GasWithdrawable {
	/**
	 * "EVM" for the vault's own chain, "SOLANA" for the perp venue's.
	 *
	 * Was `"BASE"` — a chain name, which stopped being accurate once a vault
	 * could custody elsewhere. This says which of the agent's two wallets;
	 * `chainId` says which EVM chain.
	 */
	chain: "EVM" | "SOLANA";
	/** The EVM chain. Null on the Solana row. */
	chainId: number | null;
	address: string;
	balance: string;
	spendable: string;
	formattedSpendable: string;
	/** The chain's native unit. X Layer charges gas in OKB, not ETH. */
	symbol: "ETH" | "OKB" | "SOL";
	note: string | null;
}

export interface VaultGasWithdrawable {
	vault: string;
	agentEnabled: boolean;
	base: GasWithdrawable;
	solana: GasWithdrawable;
}

export interface GasWithdrawal {
	/**
	 * "EVM" for the vault's own chain, "SOLANA" for the perp venue's.
	 *
	 * Was `"BASE"` — a chain name, which stopped being accurate once a vault
	 * could custody elsewhere. This says which of the agent's two wallets;
	 * `chainId` says which EVM chain.
	 */
	chain: "EVM" | "SOLANA";
	/** The EVM chain. Null on the Solana row. */
	chainId: number | null;
	vault: string;
	from: string;
	to: string;
	amount: string;
	formatted: string;
	/** The chain's native unit. X Layer charges gas in OKB, not ETH. */
	symbol: "ETH" | "OKB" | "SOL";
	feeReserved: string;
	remaining: string;
	hash: string;
	explorerUrl: string;
}

/**
 * The agent's Pacifica side.
 *
 * `registered` is Pacifica's own view and only becomes true after a deposit —
 * the venue has no registration call. `tokenAccountExists` is the part an
 * operator can actually do something about before then.
 */
export interface PacificaAccountStatus {
	vault: string;
	account: string;
	tokenAccount: string;
	tokenAccountExists: boolean;
	usdcBalance: string;
	equityUsd: string | null;
	registered: boolean;
	canSetUp: boolean;
	blockedReason: string | null;
	minimumDepositUsdc: number;
}

export interface PacificaAccountSetup {
	vault: string;
	account: string;
	tokenAccount: string;
	hash: string | null;
	explorerUrl: string | null;
	summary: string;
}

/** A vault's market as the admin console reads and writes it. */
export interface VaultMarketConfig {
	ticker: string;
	spotTokenAddress: string;
	spotTokenDecimals: number;
	spotTokenSymbol: string;
	perpSymbol: string;
	targetWeightBps: number;
	enabled: boolean;
	/** True when the row was derived from the vault's founding market columns. */
	seeded: boolean;
}

export interface AgentRun {
	id: string;
	vaultAddress: string;
	action: string;
	/** Which market the action was aimed at, when it was aimed at one. */
	market: string | null;
	rationale: string;
	advised: boolean;
	navReported: boolean;
	activityReported: number;
	fulfilled: number;
	error: string | null;
	createdAt: string;
}

/**
 * Whether the read model can be believed.
 *
 * The indexer's failure mode is silence: it answers `200 []` rather than
 * erroring, so an empty board looks identical to a protocol nobody has
 * deposited into. Every vault figure on the console is downstream of this.
 */
export interface IndexerHealth {
	/**
	 * `incomplete` is the important one — finished indexing and still missing
	 * vaults the chain says exist. That is not lag; waiting does not fix it.
	 */
	state: "unreachable" | "backfilling" | "incomplete" | "behind" | "synced";
	summary: string;
	remedy: string | null;
	indexerUrl: string;
	historicalComplete: boolean;
	indexedBlock: number | null;
	headBlock: number | null;
	blocksBehind: number | null;
	/** `expected` is null when it could not be asked — not the same as zero. */
	vaults: { indexed: number | null; expected: number | null };

	/**
	 * Per chain, for every chain this deployment indexes.
	 *
	 * The fields above are the worst of these. They cannot say *which* chain is
	 * unhappy, and chains are indexed independently — one slow endpoint puts
	 * only its own chain behind — so the breakdown is what an operator acts on.
	 * A chain with no factory configured is absent rather than zero.
	 */
	chains: IndexerChainHealth[];
}

export interface IndexerChainHealth {
	chainId: number;
	/** Ponder's key for the chain: "base", "arbitrum", "xlayer". */
	key: string;
	/** As a person would say it — "X Layer". */
	name: string;
	state: IndexerHealth["state"];
	summary: string;
	indexedBlock: number | null;
	headBlock: number | null;
	blocksBehind: number | null;
	vaults: { indexed: number | null; expected: number | null };
}

export const adminApi = {
	session: () =>
		request<{ isAdmin: boolean; canCreateVaults: boolean; address?: string }>("/admin/session"),
	/**
	 * The board for one chain.
	 *
	 * Chain-scoped because the spot leg is: Base lists the Coinbase B20
	 * equities, X Layer its own `w…x` family, and Arbitrum no equities at all.
	 * Omitting the chain gets the deployment's primary one.
	 */
	markets: (chainId?: number) =>
		request<{ markets: VaultableMarket[] }>("/admin/markets", {
			query: { chainId: chainId === undefined ? undefined : String(chainId) },
		}),
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
	indexer: () => request<IndexerHealth>("/admin/indexer"),

	prepare: (body: {
		ticker: string;
		tier: "conservative" | "leveraged";
		/** Which chain to deploy on. The agent wallet is derived from it. */
		chainId?: number;
		targetLeverageBps?: number;
		maxLeverageBps?: number;
	}) => post<PreparedVault>("/admin/vaults/prepare", body),

	record: (body: {
		address: string;
		ticker: string;
		tier: "conservative" | "leveraged";
		chainId?: number;
		spotTokenAddress: string;
		spotTokenDecimals: number;
		spotTokenSymbol: string;
		perpSymbol: string;
		assetClass?: string;
	}) => post<{ vault: unknown }>("/admin/vaults", body),

	setAgent: (address: string, enabled: boolean) =>
		post<{ vault: unknown }>(`/admin/vaults/${address}/agent`, { enabled }),

	/**
	 * Ask the agent to correct the hedge on its next tick.
	 *
	 * Returns as soon as the request is recorded, not when it is served — the
	 * agent ticks on its own interval, and the answer arrives on the vault as
	 * `rebalanceOutcome`.
	 */
	rebalance: (address: string) =>
		post<{ vault: unknown }>(`/admin/vaults/${address}/rebalance`, {}),

	vaultMarkets: (address: string, chainId?: number) =>
		request<{ markets: VaultMarketConfig[] }>(`/admin/vaults/${address}/markets`, {
			query: { chainId: chainId === undefined ? undefined : String(chainId) },
		}),

	/**
	 * Replace the whole set at once.
	 *
	 * The whole set rather than one market at a time, because the weights only
	 * mean anything together — a vault weighted to 140% between two requests is a
	 * vault an agent can tick against.
	 */
	setVaultMarkets: (
		address: string,
		markets: Array<{ ticker: string; targetWeightBps: number }>,
		chainId?: number,
	) =>
		put<{ markets: VaultMarketConfig[] }>(`/admin/vaults/${address}/markets`, { markets, chainId }),

	/**
	 * Order every position closed and all capital returned — or lift that order.
	 *
	 * Returns as soon as the instruction is recorded. The close itself is minutes
	 * of venue round trips on the agent's next tick.
	 */
	setCloseOrder: (address: string, closing: boolean, reason?: string) =>
		post<{ vault: unknown }>(`/admin/vaults/${address}/close`, { closing, reason }),

	withdrawableGas: (address: string) =>
		request<VaultGasWithdrawable>(`/admin/gas/${address}/withdrawable`),

	/** `amount` is in ETH or SOL, not wei or lamports. Omit it to sweep. */
	withdrawGas: (address: string, body: { chain: "EVM" | "SOLANA"; to: string; amount?: string }) =>
		post<{ withdrawal: GasWithdrawal }>(`/admin/gas/${address}/withdraw`, body),

	pacificaAccount: (address: string) =>
		request<PacificaAccountStatus>(`/admin/vaults/${address}/pacifica`),

	setUpPacificaAccount: (address: string) =>
		post<{ setup: PacificaAccountSetup }>(`/admin/vaults/${address}/pacifica`, {}),
};

export const authApi = {
	me: () => request<{ account: { address: string; isAdmin: boolean } | null }>("/auth/me"),
	challenge: (address: string) =>
		post<{ nonce: string; message: string }>("/auth/challenge", { address }),
	signIn: (body: { address: string; nonce: string; signature: string }) =>
		post<{ account: { address: string; isAdmin: boolean } }>("/auth/sign-in", body),
	signOut: () => post<{ ok: true }>("/auth/sign-out", {}),
};
