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
 * Mirrors `RebalanceStatus` in the API, where the reasoning lives. Two of these
 * say a correction is coming and differ only in which leg makes it: `ready` on
 * the perp, `ready-spot` by selling the holding down when the perp venue
 * refuses an order that small. The blocked pair mean the gap is real and
 * neither leg can carry it — not an error, and a UI that paints them red is
 * telling the reader the wrong thing.
 */
export type RebalanceStatus =
	| "neutral"
	| "ready"
	| "ready-spot"
	| "below-lot-size"
	| "below-min-notional"
	| "unknown";

/**
 * Why the spot leg is or is not carrying a correction the perp venue refused.
 *
 * Mirrors `SpotFallback` in the API. The UI branches on this rather than
 * inferring a reason from the numbers, because the inference is wrong in the
 * case that matters: a pool with no route and a gap too small to bother with
 * look identical from outside and mean different things.
 */
export type SpotFallback =
	| "not-needed"
	| "available"
	| "wrong-direction"
	| "too-small"
	| "no-route"
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
	/** Units the correcting leg trades — perp-snapped for `ready`, the whole gap for `ready-spot`. */
	correctionUnits: number;
	/** What the correction is worth, which is what the venue's minimum is checked against. */
	correctionUsd: number | null;
	status: RebalanceStatus;
	/** Why the spot leg is or is not carrying this. Never inferred from the numbers. */
	spotFallback: SpotFallback;
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

/**
 * One step of a hand-driven unwind, and what became of it.
 *
 * Distinct from the close order, which is an instruction the *agent* carries
 * out on its next tick. These run in the API process against the venues
 * directly, which is what an operator needs when the agent is stopped or has
 * failed part-way through a close and left one leg open.
 */
export type OperatorStep =
	/** The whole close in one press: both legs, the margin, and the money home. */
	| "CLOSE_ALL"
	| "CLOSE_SPOT"
	| "CLOSE_PERP"
	| "BRIDGE_HOME"
	| "RETURN_TO_VAULT"
	/** The other direction: deploy the vault's idle capital back into one market. */
	| "REOPEN";

export interface OperatorAction {
	id: string;
	vault: string;
	chainId: number;
	step: OperatorStep;
	status: "RUNNING" | "DONE" | "FAILED" | "ABANDONED";
	requestedBy: string;
	/** What happened, in a sentence. Null while it is still happening. */
	detail: string | null;
	error: string | null;
	/** Rows this step published to the vault's public activity feed. */
	activityReported: number;
	startedAt: string;
	finishedAt: string | null;
	/**
	 * Running, but no longer saying so. The process that started it is gone —
	 * which says nothing about whether its venue calls landed, so the position is
	 * the thing to read next.
	 */
	stale: boolean;
}

/** One market's two legs, as the venues report them right now. */
export interface PositionLeg {
	ticker: string;
	symbol: string;
	perpSymbol: string;
	/** Both legs at the same 1e18 basis, so they can be compared directly. */
	spotUnits: string;
	/** What the spot would fetch if sold now, in USDC base units. Null when unroutable. */
	spotValueUsdc: string | null;
	perpUnits: string;
	perpNotionalUsdc: string;
}

/**
 * What a vault is holding, read live from the venues.
 *
 * Not the vault's reported NAV. An operator running these steps has usually
 * stopped the agent, which is exactly what makes the reported figure stale.
 */
export interface PositionSnapshot {
	vault: string;
	chainId: number;
	chainName: string;
	agentEnabled: boolean;
	markets: PositionLeg[];
	idleOnBase: string;
	unallocatedMargin: string;
	inFlight: string;
	/** Why the venues could not be read. The steps still work without this. */
	unavailable: string | null;
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

	/**
	 * What the venues say this vault is holding right now.
	 *
	 * A live read — a sell quote per market plus the perp account — so it is
	 * fetched when the unwind panel opens and when an operator asks again, never
	 * polled.
	 */
	position: (address: string) => request<PositionSnapshot>(`/admin/vaults/${address}/position`),

	/** The hand-run steps against one vault, newest first. Cheap enough to poll. */
	positionSteps: (address: string) =>
		request<{ steps: OperatorAction[] }>(`/admin/vaults/${address}/steps`),

	/**
	 * Run one step of an unwind by hand, without the agent.
	 *
	 * Returns as soon as the step has *started*. A bridge can run for the better
	 * part of an hour, so the row that comes back is a handle to watch through
	 * `positionSteps`, not a result.
	 */
	runPositionStep: (address: string, step: OperatorStep, reason?: string) =>
		post<{ step: OperatorAction }>(`/admin/vaults/${address}/position/${step}`, { reason }),

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

// ---------------------------------------------------------------------------
// Self-managed positions
//
// The other half of the product: the same basis trade a vault runs, run by the
// user instead. Typed separately from `vaultApi` because the two share no
// object — a vault has shares, a NAV and a withdrawal queue, and a self-managed
// position has two legs at two venues and none of those things.
//
// The custody split is the thing to carry in mind reading these types, because
// it is unusual and it is why several fields exist:
//
//   * The spot leg is in the user's own wallet. The app records it and reads it
//     back off-chain; it cannot move it.
//   * The perp leg is on Pacifica, under a Solana address derived through NEAR
//     chain signatures. That one the app can sign for.
// ---------------------------------------------------------------------------

/** The Solana wallet derived for a user, and how far through setup it is. */
export interface DerivedWallet {
	/**
	 * The derivation path — `lemon-v1/<connected address>`.
	 *
	 * Exposed rather than hidden because it is the only durable link between a
	 * connected wallet and the funds these addresses hold. Someone should be able
	 * to write it down.
	 */
	path: string;
	/** Also the Pacifica account id; the venue keys balances by the signing address. */
	solanaAddress: string;
	evmAddress: string;
	/** The USDC token account the Solana address deposits from. */
	tokenAccount: string;
	tokenAccountReady: boolean;
	builderCodeApproved: boolean;
	createdAt: string;
}

export interface UserBalances {
	solana: {
		address: string;
		/** Bridged but not yet deposited into Pacifica, 6dp. */
		idleUsdc: string;
		tokenAccountReady: boolean;
	};
	pacifica: {
		account: string;
		/** False until the first deposit — Pacifica has no registration call. */
		registered: boolean;
		equityUsdc: string | null;
		/** Margin not backing a position: what a new one can draw on. */
		availableUsdc: string | null;
		usedUsdc: string | null;
	};
	/**
	 * The venue's own floors, carried with the balances they constrain.
	 *
	 * Here rather than hardcoded in the app because getting them wrong is
	 * expensive in a specific way: a deposit under the minimum is accepted by the
	 * bridge and rejected on arrival, stranding USDC on Solana with no visible
	 * cause.
	 */
	minimums: {
		depositUsdc: number;
		positionUsdc: number;
	};
}

export interface OnboardingCosts {
	/** One-off rent for the USDC token account, in lamports. */
	tokenAccountRentLamports: string;
	depositFeeLamports: string;
	/** Without a fee payer nobody on this deployment can deposit at all. */
	feePayerConfigured: boolean;
}

export interface PositionLeg {
	/** Underlying units the venue reports. Null when the venue could not be read. */
	size: number | null;
	valueUsd: number | null;
	/**
	 * Why the leg could not be read.
	 *
	 * Distinct from a size of zero, and the distinction is the point: a flat leg
	 * and an unreadable one look identical in a number, and only one of them
	 * means the holder is unhedged.
	 */
	unavailable: string | null;
}

export type SelfPositionStatus =
	| "DRAFT"
	| "SPOT_ONLY"
	| "PERP_ONLY"
	| "OPEN"
	| "DRIFTED"
	| "CLOSING"
	| "CLOSED"
	| "STALE";

export interface SelfPosition {
	id: string;
	ticker: string;
	chainId: number;
	status: SelfPositionStatus;
	statusReason: string | null;

	spot: PositionLeg & {
		symbol: string;
		address: string;
		costUsdc: string;
	};

	perp: PositionLeg & {
		symbol: string;
		entryPrice: string;
		/** Null at 1x, where a fully collateralised short has no such price. */
		liquidationPrice: number | null;
		unrealisedPnlUsdc: string | null;
	};

	/** How far from delta-neutral this position actually is, right now. */
	hedge: {
		netUnits: number | null;
		netUsd: number | null;
		netPercent: number | null;
		balanced: boolean;
		/** The sentence to show. Composed server-side, where the context is. */
		summary: string;
	};

	economics: {
		marginUsdc: string;
		leverageBps: number;
		fundingUsdc: string;
		fundingRatePercentPerHour: number | null;
		netApyPercent: number | null;
		valueUsdc: string | null;
		unrealisedPnlUsdc: string | null;
		realisedPnlUsdc: string | null;
	};

	openedAt: string | null;
	closedAt: string | null;
	updatedAt: string;
}

export interface PositionEvent {
	id: string;
	kind: string;
	venue: string;
	chainId: number | null;
	/** A transaction hash or a Solana signature — the claim someone can check. */
	txRef: string | null;
	amount: string | null;
	valueUsdc: string | null;
	detail: string | null;
	at: string;
}

/**
 * One tradable spot-vs-perp pair — the platform's unit of inventory.
 *
 * Mirrors `BasisMarket` in `@lemon/core`, where the type and its reasoning
 * live, for the same reason `AdlRisk` is mirrored above: this package is
 * transport and formatting with no dependencies, so that any server-side caller
 * can import it without dragging the registry along.
 *
 * Keyed by the underlying's ticker rather than by either leg's symbol. The two
 * legs spell the same company differently — "NVDAc" on Base, "NVDA/USD" on
 * Pacifica — and a URL built from one of them breaks the moment a venue renames
 * its listing.
 */
export interface BasisMarket {
	id: string;
	/**
	 * The chain the spot leg lives on.
	 *
	 * Part of the market's identity, not context the caller must remember. "BTC"
	 * on Base and "BTC" on X Layer are different tokens with different liquidity
	 * that happen to share a perp.
	 */
	chainId: number;
	ticker: string;
	name: string;
	assetClass: "equity" | "crypto";
	logoUrl: string | null;

	/** The spot leg: a real ERC-20, bought through the chain's aggregator. */
	spot: {
		/** On-chain symbol, which is not the ticker — "NVDAc" for NVDA. */
		symbol: string;
		address: string;
		decimals: number;
		/** Executable price from a live route, not an oracle mid. Null when unrouted. */
		priceUsd: number | null;
		buyable: boolean;
		sellable: boolean;
		/** Measured on a probe trade, as a negative percent. */
		priceImpactPercent: number | null;
		/** The probe errored, as opposed to the aggregator reporting no pool. */
		probeFailed: boolean;
		checkedAt: number | null;
	};

	/** The perp leg: a Pacifica market, shorted against the spot holding. */
	perp: {
		symbol: string;
		/** What Pacifica accepts on the wire, e.g. "NVDA". */
		pacificaSymbol: string;
		markPrice: number | null;
		maxLeverage: number;
		/** The venue's floor for this market. The number that decides enterability. */
		minPositionUsdc: number;
		lotSize: number;
		tickSize: number;
		openInterest: number;
		availableOpenInterest: number;
		/** False outside exchange hours, which only equities have. */
		isOpen: boolean;
		fundingShortPercentPerHour: number;
		fundingLongPercentPerHour: number;
	};

	/**
	 * What the market pays and what collecting it costs.
	 *
	 * Every figure is quoted at a reference size so rows are comparable. A
	 * position sized differently is re-priced before it is opened — these rank,
	 * they do not commit.
	 */
	economics: {
		/** `(perp mark - spot) / spot`, percent. Null when either leg is unpriced. */
		basisPercent: number | null;
		fundingShortPercentPerHour: number;
		fundingAprPercent: number;
		fundingApyPercent: number;
		/** Entry + exit fees and slippage, as a percent of notional. */
		roundTripCostPercent: number;
		/** After amortising the round trip over a year. The number to rank on. */
		netApyPercent: number;
		/** Days of funding needed to cover the round trip. Null when funding is negative. */
		breakevenDays: number | null;
		referenceNotionalUsd: number;
		referenceLeverage: number;
	};

	/**
	 * Why this market cannot be entered right now. Empty means it can.
	 *
	 * Carried on the market rather than discovered at submit time, so the board
	 * shows an honest reason beside a row instead of hiding it — or worse,
	 * offering a button that fails.
	 */
	blockers: string[];
}

/** A spot asset with no perp to hedge it — listable the moment one appears. */
export interface UnpairedSpotAsset {
	symbol: string;
	ticker: string;
	name: string;
}

export interface BasisBoard {
	markets: BasisMarket[];
	unpaired: UnpairedSpotAsset[];
	/**
	 * False while the first routability probe is still running.
	 *
	 * The board says "checking liquidity" rather than rendering every market as
	 * unenterable, which would be actively wrong for the ~15 seconds a cold start
	 * takes.
	 */
	routabilityKnown: boolean;
}

/** An unsigned transaction the user's own wallet has to send. */
export interface UnsignedStep {
	/** Why this transaction exists, for the text beside the wallet prompt. */
	label: string;
	to: string;
	data: string;
	value: string;
	chainId: number;
}

/**
 * A staged action, waiting on a signature.
 *
 * `steps` may be empty, and that is a real case rather than an error: closing a
 * position whose spot leg is already gone needs no signature at all, only the
 * short bought back. A browser that treats an empty list as a failure would
 * strand exactly the positions most in need of closing.
 */
export interface PreparedAction {
	actionId: string;
	kind: string;
	step: string;
	steps: UnsignedStep[];
	/** What the server will do once the steps are signed. Shown before signing. */
	nextDescription: string;
}

export interface BridgeQuote {
	requestId: string;
	amount: string;
	originChainId: number;
	destinationChainId: number;
	destinationAmountFormatted: string;
	/** Where the funds land — the derived Solana address for a margin bridge. */
	recipient: string;
	steps: UnsignedStep[];
}

export interface BridgeProgress {
	requestId: string;
	/** Relay's own word: "pending", "success", "failure", "refund". */
	status: string;
	complete: boolean;
	/** True when the bridge failed and the funds went back to the sender. */
	refunded: boolean;
	txRefs: string[];
}

export interface BridgeRecord {
	requestId: string;
	direction: string;
	chainId: number;
	amountUsdc: string;
	landedUsdc: string | null;
	status: string;
	txRef: string | null;
	at: string;
}

export const selfApi = {
	/** Whether this deployment can run self-managed positions at all. */
	status: () => request<{ available: boolean; reason: string | null }>("/self/status"),

	/** The board of enterable pairs. Public — choosing comes before signing in. */
	markets: (options: { chainId?: number; refresh?: boolean } = {}) =>
		request<BasisBoard>("/self/markets", {
			query: {
				chainId: options.chainId,
				refresh: options.refresh ? "true" : undefined,
			},
		}),

	/** The caller's derived wallet, or null if they have never opened a position. */
	wallet: () => request<{ wallet: DerivedWallet | null }>("/self/wallet"),

	/** Derive it, creating the record on first ask. Idempotent. */
	createWallet: () => post<{ wallet: DerivedWallet }>("/self/wallet", {}),

	balances: () =>
		request<{ wallet: DerivedWallet; balances: UserBalances; costs: OnboardingCosts }>(
			"/self/balances",
		),

	positions: (options: { includeClosed?: boolean } = {}) =>
		request<{ positions: SelfPosition[]; wallet: DerivedWallet | null }>("/self/positions", {
			query: { includeClosed: options.includeClosed ? "true" : undefined },
		}),

	position: (id: string) => request<SelfPosition>(`/self/positions/${id}`),

	events: (id: string) => request<{ events: PositionEvent[] }>(`/self/positions/${id}/events`),

	// --- acting on a position --------------------------------------------
	//
	// Anything touching the spot leg is two calls, because the spot leg is in
	// the user's own wallet and the server cannot sign it. `prepare` hands back
	// unsigned transactions; the browser gets them signed; `confirm` reports the
	// hash and the server finishes with the leg it *can* sign. The `actionId`
	// binding the two is what survives a closed tab.

	openPosition: (body: {
		ticker: string;
		chainId: number;
		notionalUsd: number;
		leverage: number;
	}) => post<PreparedAction>("/self/positions/open", body),

	confirmOpen: (body: { actionId: string; txHash: string }) =>
		post<{ status: string; filled: number; shorted: number }>("/self/positions/open/confirm", body),

	/** Place the hedge on a position left holding spot alone. No signature needed. */
	hedge: (id: string) => post<{ shorted: number }>(`/self/positions/${id}/hedge`, {}),

	/** Resize the perp to match the spot. Entirely server-side — no wallet prompt. */
	rebalance: (id: string) =>
		post<{ adjusted: number; direction: "increased" | "decreased" | "none" }>(
			`/self/positions/${id}/rebalance`,
			{},
		),

	closePosition: (id: string) => post<PreparedAction>(`/self/positions/${id}/close`, {}),

	confirmClose: (body: { actionId: string; txHash?: string }) =>
		post<{ status: string; closed: number }>("/self/positions/close/confirm", body),

	// --- moving money -----------------------------------------------------

	bridgeQuote: (body: {
		to: "margin" | "chain";
		originChainId: number;
		destinationChainId?: number;
		amount: string;
	}) => post<BridgeQuote>("/self/bridge/quote", body),

	bridgeSent: (body: {
		requestId: string;
		to: "margin" | "chain";
		originChainId: number;
		recipient: string;
		amount: string;
		txRef: string;
	}) => post<{ id: string; requestId: string; status: string }>("/self/bridge/sent", body),

	bridgeStatus: (requestId: string) => request<BridgeProgress>(`/self/bridge/${requestId}`),

	bridges: () => request<{ bridges: BridgeRecord[] }>("/self/bridges"),

	/** Credit USDC that has landed in the margin wallet to Pacifica. */
	depositMargin: () =>
		post<{ deposited: number; signature: string | null; reason?: string }>(
			"/self/margin/deposit",
			{},
		),

	/** Ask Pacifica to release margin back to the margin wallet. */
	withdrawMargin: (amount: number) =>
		post<{ requested: number }>("/self/margin/withdraw", { amount }),
};
