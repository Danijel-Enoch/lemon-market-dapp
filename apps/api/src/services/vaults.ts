import { ACTIVITY_KINDS, CHAINS, RISK_TIERS } from "@lemon/contracts";
import {
	ASSET_CLASS_LABELS,
	type AssetClass,
	type AssetGroup,
	assetClassForTicker,
	assetGroupFor,
} from "@lemon/core";
import { prisma } from "@lemon/db";
import { projectVaultApy, type VaultYieldProjection } from "@lemon/registry";
import { config } from "../config";
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

/** A vault, with the label and configuration the chain does not carry. */
export interface VaultView extends IndexedVault {
	tier: "CONSERVATIVE" | "LEVERAGED";
	tierLabel: string;
	leverageLabel: string;
	spotTokenSymbol: string | null;
	perpSymbol: string | null;
	agentEnabled: boolean;
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
		return new Map(configs.map((c) => [c.address.toLowerCase(), c]));
	} catch (error) {
		console.warn("[api] vault configuration unavailable; serving chain data only", error);
		return new Map();
	}
}

export async function listVaults(): Promise<VaultView[]> {
	const [{ vaults }, byAddress, outlooks] = await Promise.all([
		fromIndexer<{ vaults: IndexedVault[] }>("/vaults"),
		vaultConfigs(),
		yieldInputs(),
	]);

	return vaults.map((v) => decorate(v, byAddress.get(v.address.toLowerCase()), outlooks));
}

export async function getVault(address: string): Promise<VaultView | null> {
	try {
		const [{ vault, apy7d, apy30d, apyAll }, byAddress, outlooks] = await Promise.all([
			fromIndexer<{
				vault: IndexedVault;
				apy7d: RealisedYield | null;
				apy30d: RealisedYield | null;
				apyAll: RealisedYield | null;
			}>(`/vaults/${address}`),
			vaultConfigs(),
			yieldInputs(),
		]);
		// The two indexer endpoints disagree about where the yield windows live:
		// `/vaults` embeds them on each row, `/vaults/:address` returns them
		// beside the vault. Destructuring only `vault` dropped them silently, so
		// the vault page's "7d realised" card was blank on every vault while the
		// board showed a figure for the same one.
		return decorate(
			{ ...vault, apy7d, apy30d, apyAll },
			byAddress.get(address.toLowerCase()),
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
		agentEnabled: record?.agentEnabled ?? false,
		agentPath: record?.agentPath ?? null,
		navStale: v.lastNavReportAt !== null && now - v.lastNavReportAt > NAV_STALENESS_SECONDS,
		assetClass,
		assetClassLabel: ASSET_CLASS_LABELS[assetClass],
		assetGroup: assetGroupFor(assetClass),
		outlook: outlookFor(v, ticker, outlooks),
	};
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

async function yieldInputs() {
	try {
		const [{ markets: basis }, perps] = await Promise.all([listBasisMarkets(), getMarkets()]);
		const byPacificaSymbol = new Map(perps.map((p) => [p.pacifica.pacificaSymbol, p]));

		return {
			ok: true as const,
			observedAt: Math.floor(Date.now() / 1000),
			byTicker: new Map(basis.map((m) => [m.ticker.toUpperCase(), m])),
			byPacificaSymbol,
		};
	} catch (error) {
		console.warn("[api] venue data unavailable; vaults will carry no yield projection", error);
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

	const basis = inputs.byTicker.get(ticker.toUpperCase());
	if (!basis) {
		return {
			available: false,
			reason: `No live ${ticker} basis market, so there is no funding rate to project from.`,
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

	if (chain === "BASE") {
		return hex.length === 64 ? `https://basescan.org/tx/0x${hex}` : null;
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

export async function getTransfers(address: string) {
	return fromIndexer(`/vaults/${address}/transfers`);
}

export async function getQueue(address?: string) {
	return fromIndexer(address ? `/queue?vault=${address}` : "/queue");
}

export async function getProtocolStats() {
	return fromIndexer("/stats");
}
