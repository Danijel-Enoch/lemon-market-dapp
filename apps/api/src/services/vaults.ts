import { ACTIVITY_KINDS, CHAINS, RISK_TIERS } from "@lemon/contracts";
import {
	ASSET_CLASS_LABELS,
	type AssetClass,
	type AssetGroup,
	allChains,
	assetClassForTicker,
	assetGroupFor,
	DEFAULT_CHAIN_ID,
	explorerTx,
	requireChainInfo,
} from "@lemon/core";
import { prisma, type VaultMarketConfig } from "@lemon/db";
import { projectVaultApy, type VaultYieldProjection } from "@lemon/registry";
import { config } from "../config";
import { logger } from "../log";
import { listBasisMarkets } from "./basis-markets";
import { getMarkets } from "./markets";

/**
 * The vault read layer.
 *
 * Almost everything here is a pass-through to the indexer. That is deliberate:
 * the indexer's numbers come from replayable events, and re-deriving any of them
 * here would create a second implementation that has to agree with the first
 * forever. What this layer adds is the two things the indexer genuinely cannot
 * know — the human ticker behind a hashed market id, and whether an agent's
 * reported action has been checked against the chain it names.
 */

export class IndexerUnavailableError extends Error {
	readonly reason: string;
	constructor(reason: string) {
		super(reason);
		this.name = "IndexerUnavailableError";
		this.reason = reason;
	}
}

async function fromIndexer<T>(path: string): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${config.indexerUrl}${path}`, {
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		throw new IndexerUnavailableError(
			`The indexer at ${config.indexerUrl} is not reachable, so vault data cannot be served. (${error instanceof Error ? error.message : String(error)})`,
		);
	}

	if (!response.ok) {
		throw new IndexerUnavailableError(`The indexer answered ${response.status} for ${path}.`);
	}
	return (await response.json()) as T;
}

export interface IndexedVault {
	address: string;
	/**
	 * The chain this vault is deployed on, from the indexer's own row.
	 *
	 * Optional because a response from an indexer built before multi-chain has no
	 * such field, and a deployment can run a newer API against an older indexer
	 * for the length of a rollout. `vaultKey` treats a missing value as Base,
	 * which is what every vault that existed then actually was.
	 */
	chainId?: number;
	marketId: string;
	ticker: string | null;
	name: string;
	symbol: string;
	agentWallet: string;
	riskTier: number;
	targetLeverageBps: number;
	maxLeverageBps: number;
	totalAssets: string;
	totalSupply: string;
	idleAssets: string;
	deployedAssets: string;
	pricePerShare: string;
	lastObservedLeverageBps: number;
	lastNavReportAt: number | null;
	depositorCount: number;
	/** Signed USDC. Optional because a vault indexed before this was tracked has none. */
	cumulativeFunding?: string | null;
	fundingSettlementCount?: number | null;
	firstFundingAt?: number | null;
	paused: boolean;
	emergencyExit: boolean;
	apy7d?: RealisedYield | null;
	apy30d?: RealisedYield | null;
	apyAll?: RealisedYield | null;

	/** The vault's own terms, from `limits()`. Null on a vault indexed before
	 * they were read, in which case no projection is offered. */
	managementFeeBps?: number | null;
	performanceFeeBps?: number | null;
	maxDeployedBps?: number | null;
}

/**
 * A realised-yield window, annualised, or `apy: null` when the window is too
 * short or too implausible to annualise. The indexer decides which; this layer
 * only carries it.
 */
export interface RealisedYield {
	apy: number | null;
	from?: number;
	to?: number;
	samples?: number;
}

/** One market a vault runs, as the apps show it. */
export interface VaultMarketView {
	ticker: string;
	spotTokenSymbol: string;
	spotTokenAddress: string;
	perpSymbol: string;
	/** Share of the vault's spot notional this market should carry, in bps. */
	targetWeightBps: number;
	/**
	 * False for a market an operator has retired. It keeps its row because the
	 * vault may still hold a position in it, which the agent has to be able to
	 * see, value and sell — but no new capital goes into it.
	 */
	enabled: boolean;
}

/** A vault, with the label and configuration the chain does not carry. */
export interface VaultView extends IndexedVault {
	tier: "CONSERVATIVE" | "LEVERAGED";
	tierLabel: string;
	leverageLabel: string;
	/**
	 * The vault's founding market, kept for every caller that predates a vault
	 * having more than one. `markets[0]` is the same thing said properly.
	 */
	spotTokenSymbol: string | null;
	perpSymbol: string | null;
	/**
	 * Every market this vault runs, enabled first and heaviest first.
	 *
	 * Empty for a vault with no venue configuration — the same state that already
	 * leaves `perpSymbol` null and has the agent refuse to trade it.
	 */
	markets: VaultMarketView[];
	agentEnabled: boolean;
	/**
	 * When an operator ordered every position closed and all capital returned,
	 * and when the agent first found the vault flat under that order.
	 *
	 * Public rather than admin-only. A vault standing down is the most material
	 * thing that can happen to a depositor's position short of a pause, and they
	 * find out from the activity feed either way — showing it plainly beats
	 * leaving them to infer it from a position that quietly went to zero.
	 */
	closeRequestedAt: string | null;
	closeCompletedAt: string | null;

	/**
	 * A hand-asked rebalance: when it was asked for, and what became of it.
	 *
	 * Both halves, because "pending" and "served" are different states and the
	 * dashboard has to tell them apart. `rebalanceOutcome` carries the answer
	 * even when the answer is that nothing could be done — a correction under
	 * the venue's minimum order is the common case on a small vault, and
	 * reporting it as an outcome is the difference between an operator learning
	 * why and watching a button appear to do nothing.
	 */
	rebalanceRequestedAt: string | null;
	rebalanceCompletedAt: string | null;
	rebalanceOutcome: string | null;

	/**
	 * The NEAR path the vault's agent wallet was derived from.
	 *
	 * Public on purpose. It is derivable from the ticker and tier anyway, and
	 * publishing it is what lets anyone reproduce the agent's addresses rather
	 * than taking ours on trust. It is also what the agent process reads to
	 * reconstruct the wallet the vault actually names.
	 */
	agentPath: string | null;
	/** True when the last NAV report is old enough that the vault will not price. */
	navStale: boolean;
	/** What kind of thing this vault trades, and which board tab it belongs in. */
	assetClass: AssetClass;
	assetClassLabel: string;
	assetGroup: AssetGroup;

	/**
	 * What this vault would pay if today's funding rate held — or why it cannot
	 * be said.
	 *
	 * The realised columns cannot answer the question a depositor actually has,
	 * because they measure a share price this vault may not have moved yet. A
	 * new vault, or one nobody has deposited into, has no realised figure and
	 * never will until somebody goes first. This is the number for that moment,
	 * and it is a projection rather than a measurement — see `VaultOutlook`.
	 */
	outlook: VaultOutlook;
}

/**
 * The forward-looking yield estimate, or the reason there isn't one.
 *
 * Modelled as a union rather than as a nullable number with a separate reason
 * field, so a caller cannot render a figure and a "why not" at the same time,
 * and cannot show a projection without also carrying the label that says it is
 * one. `available: false` always has something to display in the same slot.
 */
export type VaultOutlook =
	| ({
			available: true;
			/** Unix seconds. A funding rate is a snapshot and ages quickly. */
			observedAt: number;
			/** Short-side funding, percent per hour, exactly as the venue quotes it. */
			fundingShortPercentPerHour: number;
	  } & VaultYieldProjection)
	| { available: false; reason: string };

const NAV_STALENESS_SECONDS = 6 * 3600;

/**
 * The key every by-vault map in this file is built on.
 *
 * Chain and address, never address alone. Vault addresses are `CREATE`-derived
 * from factories deployed at matching nonces, so the same address on two chains
 * is the likely case — and these maps join the chain's data to the operator's
 * configuration. Keyed by address, an Arbitrum vault would be labelled with a
 * Base vault's ticker, spot token and perp symbol, and the agent reading that
 * configuration would hedge the wrong asset. Every field involved is plausible,
 * so nothing downstream would reject it.
 */
function vaultKey(chainId: number | null | undefined, address: string): string {
	return `${chainId ?? DEFAULT_CHAIN_ID}:${address.toLowerCase()}`;
}

/**
 * The operator's venue configuration, or nothing.
 *
 * Deliberately swallows a database failure. Every number a depositor acts on —
 * balances, share price, the queue — comes from the chain through the indexer,
 * and this only adds labels and the market pairing. A vault page that 503s
 * because Postgres is down would be hiding working data behind a dependency it
 * does not actually have.
 */
async function vaultConfigs(): Promise<Map<string, VaultConfigRecord>> {
	try {
		const configs = await prisma.vaultConfig.findMany();
		return new Map(configs.map((c) => [vaultKey(c.chainId, c.address), c]));
	} catch (error) {
		logger.warn("Vault configuration unavailable; serving chain data only.", error);
		return new Map();
	}
}

/**
 * Every vault's markets, in one query.
 *
 * Read directly rather than through `vaultMarkets`, which seeds a founding row
 * for a vault that predates having several. Seeding is a write, and this is the
 * public read path — a depositor loading the board should not be triggering
 * database writes, and the agent and the admin console both seed on paths where
 * a write is expected. A vault whose row has not been seeded yet falls back to
 * its founding-market columns below, which say exactly the same thing.
 */
async function vaultMarketRows(): Promise<Map<string, VaultMarketConfig[]>> {
	try {
		const rows = await prisma.vaultMarket.findMany();
		const byVault = new Map<string, VaultMarketConfig[]>();
		for (const row of rows) {
			const key = vaultKey(row.chainId, row.vaultAddress);
			const list = byVault.get(key) ?? [];
			list.push({
				ticker: row.ticker,
				spotTokenAddress: row.spotTokenAddress,
				spotTokenDecimals: row.spotTokenDecimals,
				spotTokenSymbol: row.spotTokenSymbol,
				perpSymbol: row.perpSymbol,
				targetWeightBps: row.enabled ? row.targetWeightBps : 0,
				enabled: row.enabled,
				seeded: row.seeded,
			});
			byVault.set(key, list);
		}
		return byVault;
	} catch {
		// Same reasoning as `vaultConfigs`: labels are not worth a 503 on data that
		// comes from the chain and is unaffected.
		return new Map();
	}
}

export async function listVaults(): Promise<VaultView[]> {
	const [{ vaults }, byAddress, markets, outlooks] = await Promise.all([
		fromIndexer<{ vaults: IndexedVault[] }>("/vaults"),
		vaultConfigs(),
		vaultMarketRows(),
		yieldInputs(),
	]);

	return vaults.map((v) =>
		decorate(
			v,
			byAddress.get(vaultKey(v.chainId, v.address)),
			markets.get(vaultKey(v.chainId, v.address)),
			outlooks,
		),
	);
}

/**
 * One vault.
 *
 * `chainId` is optional and forwarded to the indexer when given. Omitted, the
 * indexer resolves the address itself and answers 400 if it names a vault on
 * more than one chain — which is the right place for that decision, because it
 * is the only party that knows which chains actually have a vault there.
 */
export async function getVault(address: string, chainId?: number): Promise<VaultView | null> {
	const scoped = chainId === undefined ? "" : `?chainId=${chainId}`;
	try {
		const [{ vault, apy7d, apy30d, apyAll }, byAddress, markets, outlooks] = await Promise.all([
			fromIndexer<{
				vault: IndexedVault;
				apy7d: RealisedYield | null;
				apy30d: RealisedYield | null;
				apyAll: RealisedYield | null;
			}>(`/vaults/${address}${scoped}`),
			vaultConfigs(),
			vaultMarketRows(),
			yieldInputs(),
		]);
		// The two indexer endpoints disagree about where the yield windows live:
		// `/vaults` embeds them on each row, `/vaults/:address` returns them
		// beside the vault. Destructuring only `vault` dropped them silently, so
		// the vault page's "7d realised" card was blank on every vault while the
		// board showed a figure for the same one.
		// The vault's own row is authoritative for the chain, not the parameter:
		// an omitted `chainId` was resolved by the indexer, and reading it back
		// from the answer is what makes the two halves of this join agree.
		const key = vaultKey(vault.chainId, address);
		return decorate(
			{ ...vault, apy7d, apy30d, apyAll },
			byAddress.get(key),
			markets.get(key),
			outlooks,
		);
	} catch (error) {
		if (error instanceof IndexerUnavailableError && error.message.includes("404")) return null;
		throw error;
	}
}

type VaultConfigRecord = Awaited<ReturnType<typeof prisma.vaultConfig.findMany>>[number];

function decorate(
	v: IndexedVault,
	record: VaultConfigRecord | undefined,
	markets: VaultMarketConfig[] | undefined,
	outlooks: YieldInputs,
): VaultView {
	const tier = (RISK_TIERS[v.riskTier] ?? "CONSERVATIVE") as "CONSERVATIVE" | "LEVERAGED";
	const now = Math.floor(Date.now() / 1000);
	const ticker = record?.ticker ?? v.ticker;

	// The database is authoritative where an operator has classified the market;
	// otherwise fall back to the curated ticker table. Both are curated — neither
	// infers a class from the shape of a symbol.
	const assetClass =
		(record?.assetClass?.toLowerCase() as AssetClass | undefined) ?? assetClassForTicker(ticker);

	return {
		...v,
		// The indexer's rainbow table covers the listed universe; the database is
		// authoritative for anything it does not.
		ticker,
		tier,
		tierLabel: tier === "CONSERVATIVE" ? "Conservative" : "Leveraged",
		leverageLabel: formatLeverage(v.targetLeverageBps, v.maxLeverageBps),
		spotTokenSymbol: record?.spotTokenSymbol ?? null,
		perpSymbol: record?.perpSymbol ?? null,
		markets: marketViews(record, markets),
		agentEnabled: record?.agentEnabled ?? false,
		closeRequestedAt: record?.closeRequestedAt?.toISOString() ?? null,
		closeCompletedAt: record?.closeCompletedAt?.toISOString() ?? null,
		rebalanceRequestedAt: record?.rebalanceRequestedAt?.toISOString() ?? null,
		rebalanceCompletedAt: record?.rebalanceCompletedAt?.toISOString() ?? null,
		rebalanceOutcome: record?.rebalanceOutcome ?? null,
		agentPath: record?.agentPath ?? null,
		navStale: v.lastNavReportAt !== null && now - v.lastNavReportAt > NAV_STALENESS_SECONDS,
		assetClass,
		assetClassLabel: ASSET_CLASS_LABELS[assetClass],
		assetGroup: assetGroupFor(assetClass),
		outlook: outlookFor(v, ticker, outlooks),
	};
}

/**
 * A vault's markets, falling back to its founding one.
 *
 * The fallback covers a vault created before `VaultMarket` existed whose row has
 * not been seeded yet — the columns on `VaultConfig` describe exactly the same
 * single market, so the fallback is a restatement rather than a guess. Without
 * it those vaults would show no markets at all until an agent ticked, which
 * reads as a misconfigured vault rather than an ordinary one.
 */
function marketViews(
	record: VaultConfigRecord | undefined,
	markets: VaultMarketConfig[] | undefined,
): VaultMarketView[] {
	if (markets && markets.length > 0) {
		return [...markets]
			.sort((a, b) => {
				if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
				if (a.targetWeightBps !== b.targetWeightBps) return b.targetWeightBps - a.targetWeightBps;
				return a.ticker.localeCompare(b.ticker);
			})
			.map((market) => ({
				ticker: market.ticker,
				spotTokenSymbol: market.spotTokenSymbol,
				spotTokenAddress: market.spotTokenAddress,
				perpSymbol: market.perpSymbol,
				targetWeightBps: market.targetWeightBps,
				enabled: market.enabled,
			}));
	}

	if (!record) return [];

	return [
		{
			ticker: record.ticker,
			spotTokenSymbol: record.spotTokenSymbol,
			spotTokenAddress: record.spotTokenAddress,
			perpSymbol: record.perpSymbol,
			targetWeightBps: 10_000,
			enabled: true,
		},
	];
}

// ---------------------------------------------------------------------------
// The forward-looking yield
// ---------------------------------------------------------------------------

/**
 * Everything the projection needs from the venues, fetched once per request.
 *
 * `null` means the venues could not be reached. That is deliberately different
 * from "this vault has no market": an outage must not be reported to every
 * depositor as though the funding rate were zero, and it must not take the
 * board down either — the balances, the queue and the realised columns all come
 * from the chain and are unaffected.
 */
type YieldInputs = Awaited<ReturnType<typeof yieldInputs>>;

/**
 * The key a projection is looked up by: chain, then ticker.
 *
 * A plain template literal inside the map builder narrows to the three chain
 * ids and then refuses a lookup typed as `number`. One function used by both
 * sides keeps the key format in one place and the types agreeing.
 */
function outlookKey(chainId: number, ticker: string): string {
	return `${chainId}:${ticker.toUpperCase()}`;
}

async function yieldInputs() {
	try {
		/**
		 * Every chain's board, keyed by chain and ticker.
		 *
		 * The funding half of a projection is chain-independent — Pacifica's ETH
		 * perp pays the same whichever chain the spot leg sits on — but the spot
		 * half is not. Price impact, the fees of a round trip and whether the
		 * market is blocked at all are properties of that chain's pools, and
		 * X Layer's xETH is a different pool from Base's WETH.
		 *
		 * Keyed by ticker alone, an X Layer vault would be projected off Base's
		 * spot costs. That is not a small error: it is the number a depositor is
		 * shown *before* they commit, on the screen where the decision is made.
		 */
		const boards = await Promise.all(
			allChains().map(async (chain) => ({
				chain,
				board: await listBasisMarkets(chain.id),
			})),
		);
		const perps = await getMarkets();
		const byPacificaSymbol = new Map(perps.map((p) => [p.pacifica.pacificaSymbol, p]));

		const byTicker = new Map(
			boards.flatMap(({ chain, board }) =>
				board.markets.map((m) => [outlookKey(chain.id, m.ticker), m] as const),
			),
		);

		return {
			ok: true as const,
			observedAt: Math.floor(Date.now() / 1000),
			byTicker,
			byPacificaSymbol,
		};
	} catch (error) {
		logger.warn("Venue data unavailable; vaults will carry no yield projection.", error);
		return { ok: false as const };
	}
}

/**
 * Project one vault's yield, or say why not.
 *
 * Every branch that returns `available: false` is a case where a number could
 * technically be produced and would be misleading. A blocked market has a
 * funding rate, but it is a rate on a position the agent cannot actually open;
 * a vault with unread fee limits would report a gross figure as a net one.
 * Showing the reason is the point — a depositor who sees a dash with no
 * explanation cannot tell an unlisted market from a broken one.
 */
function outlookFor(v: IndexedVault, ticker: string | null, inputs: YieldInputs): VaultOutlook {
	if (!inputs.ok) {
		return { available: false, reason: "Venue data is unavailable, so no yield can be projected." };
	}
	if (!ticker) {
		return {
			available: false,
			reason: "This vault's market has not been identified, so its funding rate is unknown.",
		};
	}

	const chainId = v.chainId ?? DEFAULT_CHAIN_ID;
	const basis = inputs.byTicker.get(outlookKey(chainId, ticker));
	if (!basis) {
		return {
			available: false,
			reason: `No live ${ticker} basis market on ${requireChainInfo(chainId).name}, so there is no funding rate to project from.`,
		};
	}
	if (basis.blockers.length > 0) {
		// The rate exists; the position it would be earned on does not. Quoting it
		// would advertise a yield on a trade the agent is currently unable to
		// place, which is the most expensive kind of wrong number here.
		return {
			available: false,
			reason: `The ${ticker} market cannot be entered right now: ${basis.blockers[0]}`,
		};
	}

	const perp = inputs.byPacificaSymbol.get(basis.perp.pacificaSymbol);
	if (!perp) {
		return {
			available: false,
			reason: `${basis.perp.symbol} is no longer listed, so its funding rate cannot be read.`,
		};
	}

	// The vault's own terms. Refusing without them is the whole reason they are
	// nullable in the index: a projection missing the fees is not a rougher
	// estimate, it is a different and much larger number.
	if (v.managementFeeBps == null || v.performanceFeeBps == null || v.maxDeployedBps == null) {
		return {
			available: false,
			reason: "This vault's fee terms have not been read from the chain yet.",
		};
	}

	const projection = projectVaultApy({
		fundingShortPercentPerHour: basis.perp.fundingShortPercentPerHour,
		leverage: v.targetLeverageBps / 10_000,
		deployedFraction: v.maxDeployedBps / 10_000,
		managementFeeBps: v.managementFeeBps,
		performanceFeeBps: v.performanceFeeBps,
		spotImpactPercent: basis.spot.priceImpactPercent ?? 0,
		market: perp,
	});

	return {
		available: true,
		observedAt: inputs.observedAt,
		fundingShortPercentPerHour: basis.perp.fundingShortPercentPerHour,
		...projection,
	};
}

/**
 * "1x" or "2x–3x".
 *
 * The range is shown rather than only the target because the ceiling is what
 * the contract enforces, and a depositor comparing two leveraged vaults is
 * choosing between the worst cases as much as the intended ones.
 */
function formatLeverage(targetBps: number, maxBps: number): string {
	const target = targetBps / 10_000;
	const max = maxBps / 10_000;
	const fmt = (x: number) => (Number.isInteger(x) ? `${x}x` : `${x.toFixed(1)}x`);
	return target === max ? fmt(target) : `${fmt(target)}–${fmt(max)}`;
}

// ---------------------------------------------------------------------------
// The activity feed
// ---------------------------------------------------------------------------

export interface IndexedActivity {
	id: string;
	vault: string;
	sequence: string;
	kind: number;
	chain: number;
	symbol: string;
	baseAmount: string;
	notionalAssets: string;
	pnlAssets: string;
	feeAssets: string;
	txRef: string;
	occurredAt: number;
	reportedAt: number;
	reportTxHash: string;
}

export interface ActivityView extends IndexedActivity {
	kindLabel: string;
	chainLabel: string;
	/** A link a reader can follow to the chain the agent named. */
	explorerUrl: string | null;
	/** Null while unchecked; false means the named transaction contradicts the claim. */
	verified: boolean | null;
	verificationNote: string | null;
}

const KIND_LABELS: Record<string, string> = {
	SPOT_BUY: "Bought spot",
	SPOT_SELL: "Sold spot",
	PERP_OPEN: "Opened short",
	PERP_CLOSE: "Closed short",
	PERP_REBALANCE: "Rebalanced hedge",
	BRIDGE_OUT: "Bridged out",
	BRIDGE_IN: "Bridged in",
	VENUE_DEPOSIT: "Deposited to venue",
	VENUE_WITHDRAW: "Withdrew from venue",
	FUNDING_SETTLED: "Funding settled",
};

export async function listActivity(params: {
	vault?: string;
	limit?: number;
	before?: string;
	kind?: string;
	chain?: string;
}): Promise<{ activity: ActivityView[]; nextCursor: string | null }> {
	const query = new URLSearchParams();
	if (params.limit) query.set("limit", String(params.limit));
	if (params.before) query.set("before", params.before);
	if (params.kind) query.set("kind", params.kind);
	if (params.chain) query.set("chain", params.chain);

	const path = params.vault ? `/vaults/${params.vault}/activity?${query}` : `/activity?${query}`;

	const body = await fromIndexer<{ activity: IndexedActivity[]; nextCursor?: string | null }>(path);

	// Same reasoning as the vault configuration: a verdict is an enrichment, and
	// the feed is still worth showing without one. Rows simply read as
	// unverified, which is what they are when nothing has checked them.
	const verifications = body.activity.length
		? await prisma.activityVerification
				.findMany({ where: { id: { in: body.activity.map((a) => a.id) } } })
				.catch(() => [])
		: [];
	const byId = new Map(verifications.map((v) => [v.id, v]));

	return {
		activity: body.activity.map((a) => {
			const verification = byId.get(a.id);
			const chain = CHAINS[a.chain] ?? "BASE";
			const kind = ACTIVITY_KINDS[a.kind] ?? "SPOT_BUY";
			return {
				...a,
				kindLabel: KIND_LABELS[kind] ?? kind,
				chainLabel: chain === "BASE" ? "Base" : chain === "SOLANA" ? "Solana" : "NEAR",
				explorerUrl: explorerUrlFor(chain, a.txRef),
				verified: verification?.verified ?? null,
				verificationNote: verification?.note ?? null,
			};
		}),
		nextCursor: body.nextCursor ?? null,
	};
}

/**
 * Turn a raw reference into a link.
 *
 * Solana signatures are base58, not hex, so a Solana reference has to be decoded
 * before it can be linked. Returning null on anything unrecognised is
 * deliberate: a dead link in an audit trail is worse than no link, because it
 * looks checkable and is not.
 */
export function explorerUrlFor(chain: string, txRef: string): string | null {
	const hex = txRef.startsWith("0x") ? txRef.slice(2) : txRef;
	if (hex.length === 0) return null;

	/**
	 * The EVM venues, matched by the contract's enum name.
	 *
	 * `LemonVault.Chain`'s members are spelled the same as the registry's
	 * `envSuffix` — BASE, ARBITRUM, XLAYER — so the venue an agent reported an
	 * action on maps straight onto the chain whose explorer should host the link.
	 * NEAR falls through to null below: chain signatures leave no transaction of
	 * ours to point at.
	 */
	const evm = allChains().find((info) => info.envSuffix === chain);
	if (evm) {
		return hex.length === 64 ? explorerTx(evm.id, `0x${hex}`) : null;
	}

	if (chain === "SOLANA") {
		// 64 bytes is a signature; anything shorter is a venue order id, which
		// has no explorer page.
		if (hex.length !== 128) return null;
		const bytes = Uint8Array.from(hex.match(/.{2}/g)?.map((b) => Number.parseInt(b, 16)) ?? []);
		return `https://solscan.io/tx/${base58Encode(bytes)}`;
	}

	return null;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
	let value = 0n;
	for (const byte of bytes) value = value * 256n + BigInt(byte);

	let out = "";
	while (value > 0n) {
		out = BASE58[Number(value % 58n)] + out;
		value /= 58n;
	}
	// Leading zero bytes carry no value but are part of the encoding.
	for (const byte of bytes) {
		if (byte !== 0) break;
		out = `1${out}`;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Portfolio and queue
// ---------------------------------------------------------------------------

export async function getPortfolio(owner: string) {
	return fromIndexer(`/portfolio/${owner}`);
}

export async function getNavSeries(address: string, days: number) {
	return fromIndexer(`/vaults/${address}/nav?days=${days}`);
}

/**
 * Funding paid, per UTC day.
 *
 * Separate from the NAV series because it answers a different question. The
 * share price is what a depositor's stake is worth after everything — funding,
 * fees, and whatever the two legs did to each other; this is the funding on its
 * own, which is the part the vault exists to collect and the only part that
 * arrives as a payment rather than as a revaluation.
 */
export async function getFundingSeries(address: string, days: number) {
	return fromIndexer(`/vaults/${address}/funding?days=${days}`);
}

export async function getTransfers(address: string) {
	return fromIndexer(`/vaults/${address}/transfers`);
}

export async function getQueue(address?: string) {
	return fromIndexer(address ? `/queue?vault=${address}` : "/queue");
}

export async function getProtocolStats() {
	return fromIndexer("/stats");
}
