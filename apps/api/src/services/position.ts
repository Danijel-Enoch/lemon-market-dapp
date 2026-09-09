import { type AdlRisk, adlRisk } from "@lemon/core";
import { prisma } from "@lemon/db";
import { agentDerivationPath } from "@lemon/near-mpc";
import type { PacificaAccountInfo, PacificaPosition, PacificaPrice } from "@lemon/pacifica";
import { findTokenByTicker, hedgeHealth } from "@lemon/registry";
import { type Address, erc20Abi } from "viem";
import { KeyedTtlCache } from "../cache";
import { baseClient } from "../chain";
import { clients, config } from "../config";
import { getMarkets } from "./markets";
import { getVault, type VaultView } from "./vaults";

/**
 * What a vault is actually holding, right now.
 *
 * Read from the venues rather than from anything the agent told us. That is the
 * important property: the spot leg is an ERC-20 balance on Base, and the perp
 * leg is a Pacifica account, and both are public. Every number below is one a
 * reader could fetch themselves from the addresses shown alongside it.
 *
 * This is deliberately a different kind of claim from the activity feed. Those
 * rows are the agent's account of what it *did*; this is what independently
 * exists. Where the two disagree, this is right.
 */

export interface AgentWallets {
	/** The address baked into the vault. Only place the vault can send funds. */
	evm: string;
	/** The Ed25519 address the same NEAR path controls. Also the Pacifica account. */
	solana: string | null;
	/** The derivation path, so the addresses can be reproduced independently. */
	path: string | null;
	/**
	 * True when the Solana address was derived here and its EVM sibling matches
	 * the vault's on-chain agent. A mismatch means the addresses shown do not
	 * belong together, and the Solana one is not shown at all.
	 */
	derivationVerified: boolean;
}

export interface SpotLeg {
	token: string | null;
	symbol: string | null;
	decimals: number | null;
	/** Raw token balance held by the agent wallet on Base. */
	balance: string;
	/** Executable USD value from a live sell quote, or null if unroutable. */
	valueUsd: string | null;
	/** Null when the pool cannot be routed — which is not the same as zero. */
	priceUsd: number | null;
}

export interface PerpLeg {
	symbol: string | null;
	/** Signed size. Negative is short, which is what a basis position holds. */
	size: number;
	entryPrice: number | null;
	markPrice: number | null;
	notionalUsd: number | null;
	unrealisedPnlUsd: number | null;
	/** Account equity backing the position, in USD. */
	marginUsd: number | null;
	leverage: number | null;
	fundingRateHourlyPercent: number | null;
	/**
	 * Where this short sits in Pacifica's auto-deleveraging queue.
	 *
	 * Computed here rather than fetched — Pacifica publishes no ADL endpoint —
	 * from the same quantity venues rank by. Present even when the position is
	 * not in the queue, because "not eligible, and here is why" is the answer
	 * most of the time and a depositor should be able to see it holding.
	 */
	adl: AdlRisk;
}

/**
 * Why a rebalance is or is not happening, in a form the UI can branch on.
 *
 * The two blocked states are the reason this exists. A vault can sit visibly
 * off neutral for days with the agent doing nothing, and from the outside that
 * is indistinguishable from a broken agent — when in fact the venue is refusing
 * the correction and the agent is right not to keep offering it. Neither is an
 * error: they are both statements that the legs are already as close as this
 * market will let them be.
 */
export type RebalanceStatus =
	/** Drift is inside the vault's threshold. Nothing to do. */
	| "neutral"
	/** Past the threshold, and the correction is one the venue would accept. */
	| "ready"
	/** Past the threshold, but the correction rounds to zero on the lot grid. */
	| "below-lot-size"
	/** Past the threshold, but the correction is worth less than the venue's minimum order. */
	| "below-min-notional"
	/** The mark, the lot grid or the minimum could not be read, so this cannot be judged. */
	| "unknown";

/**
 * One market's hedge, and how far its two legs have drifted apart.
 *
 * Per market because drift is a property of a *pair* of legs and there is no
 * such thing as the vault's drift — two markets a percent out in opposite
 * directions average to neutral and are both wrong. This mirrors what the agent
 * decides on, so the page and the agent cannot disagree about whether a hedge
 * needs correcting.
 *
 * Measured in units of the underlying rather than in dollars. A basis position
 * is neutral when it is long and short the same number of units, and that stays
 * true at any price; a dollar-denominated comparison would report drift every
 * time the market moved.
 */
export interface MarketHedge {
	ticker: string;
	spotSymbol: string;
	/** The Base ERC-20 the spot leg is held in, so the balance can be checked. */
	spotTokenAddress: string;
	perpSymbol: string;
	/** Tokens held on Base, as a decimal quantity of the underlying. */
	spotUnits: number;
	/** Units short on Pacifica. Zero when the hedge is not open. */
	perpUnits: number;
	/** Pacifica's mark, which is what both the delta and the venue price against. */
	markPrice: number | null;
	/** Signed unit gap. Positive is under-hedged, negative is over-hedged. */
	deltaUnits: number;
	/** The gap as a percent of the spot leg. Same sign as `deltaUnits`. */
	driftPercent: number;
	/** The gap in money at the current mark, or null with no mark to price it at. */
	deltaUsd: number | null;
	/** Direction, judged against this vault's threshold rather than the sign alone. */
	exposure: "neutral" | "long" | "short";
	/** The vault's configured threshold, in basis points, and the same figure as a percent. */
	rebalanceDriftBps: number;
	thresholdPercent: number;
	/** Pacifica's quantity increment for this symbol. Null when it could not be read. */
	lotSize: number | null;
	/** Pacifica's minimum order value in **USD**, not in units. Null when unread. */
	minOrderUsd: number | null;
	/** Units the perp leg would trade, already snapped down onto the lot grid. */
	correctionUnits: number;
	/** What that correction is worth, which is the figure the venue's minimum is checked against. */
	correctionUsd: number | null;
	status: RebalanceStatus;
}

export interface LivePosition {
	vault: string;
	wallets: AgentWallets;
	spot: SpotLeg;
	perp: PerpLeg;
	/**
	 * Every enabled market's hedge, worst drift first.
	 *
	 * Alongside `spot`/`perp` rather than replacing them: those describe the
	 * founding market only, and predate a vault running several.
	 */
	markets: MarketHedge[];
	/** USDC sitting at the agent, deployed but not yet in either leg. */
	idleAtAgentUsd: string;
	/** Sum of the legs as read here, for comparison with the reported NAV. */
	observedValueUsd: string | null;
	/** What the vault currently believes it is worth, from `reportNav`. */
	reportedDeployedUsd: string;
	/**
	 * Reported minus observed. Small values are timing — a bridge in flight, a
	 * quote moving between two calls. A persistent large gap is the thing worth
	 * looking at, which is why it is surfaced rather than reconciled away.
	 */
	discrepancyUsd: string | null;
	/** Non-fatal reasons a leg could not be read. */
	notes: string[];
	observedAt: number;
}

/**
 * How long a live position is served from memory.
 *
 * One read costs two Base `balanceOf` calls, a KyberSwap route and three
 * Pacifica requests, and the same vault is asked for by the vault page, the gas
 * console and any poll behind them. Ten seconds is five Base blocks and far
 * shorter than the interval over which any of these figures moves enough to
 * change a decision — and `observedAt` carries the age, so a cached answer
 * never claims to be fresher than it is.
 *
 * A miss is shared: `TtlCache` collapses concurrent callers into one upstream
 * read, which is the case that produced the rate limit in the first place.
 */
const LIVE_POSITION_TTL_MS = 10_000;

const livePositionCache = new KeyedTtlCache<LivePosition | null>(
	(address) => readLivePosition(address),
	LIVE_POSITION_TTL_MS,
);

/**
 * @param force Bypass the cache. For operator tools that have just moved funds
 *   and need to see the result, not a ten-second-old picture of before it.
 */
export function getLivePosition(address: string, force = false): Promise<LivePosition | null> {
	// Lowercased so the same vault under two spellings is one cache entry. The
	// indexer normalises addresses the same way, so nothing downstream notices.
	return livePositionCache.get(address.toLowerCase(), force);
}

async function readLivePosition(address: string): Promise<LivePosition | null> {
	const vault = await getVault(address);
	if (!vault) return null;

	const notes: string[] = [];
	const record = await prisma.vaultConfig
		.findUnique({ where: { address: address.toLowerCase() } })
		.catch(() => null);

	const wallets = await resolveWallets(vault, record, notes);

	// Issued together, not in sequence. Five independent reads across three
	// upstreams, and awaiting them one at a time made the page as slow as their
	// sum while denying the client any chance to batch — two `balanceOf` calls a
	// tick apart are two requests, the same two calls in one tick are one
	// multicall.
	//
	// Each read gets its own notes array rather than sharing one. Concurrent
	// pushes are safe, but their order would depend on which upstream answered
	// first, so the same vault would render its notes in a different order on
	// every load. They are concatenated below in the order they are read.
	const spotNotes: string[] = [];
	const perpNotes: string[] = [];
	const idleNotes: string[] = [];
	const inFlightNotes: string[] = [];
	const marketNotes: string[] = [];

	const [spot, venue, idle, inFlight, legs] = await Promise.all([
		readSpotLeg(vault, record, spotNotes),
		readVenue(wallets.solana, perpNotes),
		readAgentUsdc(vault.agentWallet as Address, idleNotes),
		readInFlight(address, inFlightNotes),
		readMarketLegs(address, vault.agentWallet as Address, record, marketNotes),
	]);

	// Both of these read the venue snapshot fetched above rather than fetching
	// their own. The perp leg and the per-market hedges want the same three
	// Pacifica responses, and asking twice would double the request count on the
	// upstream that already rate-limited this page once.
	const perp = perpLegFrom(venue, record);
	const markets = await readMarketHedges(
		legs,
		venue,
		record?.rebalanceDriftBps ?? DEFAULT_REBALANCE_DRIFT_BPS,
		marketNotes,
	);

	notes.push(...spotNotes, ...perpNotes, ...idleNotes, ...inFlightNotes, ...marketNotes);

	const observed = combine(spot.valueUsd, perp.marginUsd, idle + inFlight);
	const reported = BigInt(vault.deployedAssets);

	return {
		vault: vault.address,
		wallets,
		spot,
		perp,
		markets,
		idleAtAgentUsd: idle.toString(),
		observedValueUsd: observed === null ? null : observed.toString(),
		reportedDeployedUsd: reported.toString(),
		discrepancyUsd: observed === null ? null : (reported - observed).toString(),
		notes,
		observedAt: Math.floor(Date.now() / 1000),
	};
}

/**
 * USDC the vault owns that is currently between chains.
 *
 * A bridge takes minutes, and for those minutes the money is in neither balance
 * this page can read. Leaving it out would show the vault losing the whole
 * transfer and then finding it again — so the in-flight rows are added back,
 * the same way the agent's own valuation adds them.
 */
async function readInFlight(address: string, notes: string[]): Promise<bigint> {
	const rows = await prisma.bridgeTransfer
		.findMany({
			where: { vaultAddress: address.toLowerCase(), status: { in: ["PENDING", "SENT"] } },
			select: { amountUsdc: true, direction: true },
		})
		.catch(() => null);

	if (rows === null) {
		notes.push("Could not read in-flight bridges, so any USDC between chains is missing here.");
		return 0n;
	}
	if (rows.length === 0) return 0n;

	const total = rows.reduce((sum, row) => sum + BigInt(row.amountUsdc), 0n);
	notes.push(
		`${rows.length} bridge${rows.length === 1 ? "" : "s"} in flight, totalling ${Number(total) / 1e6} USDC, counted here but visible in neither chain's balance yet.`,
	);
	return total;
}

/** A venue decimal string as a number, or null when it is missing or junk. */
function finite(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

type VaultConfigRecord = Awaited<ReturnType<typeof prisma.vaultConfig.findUnique>>;

/**
 * Resolve both of the agent's addresses.
 *
 * The EVM one is on-chain and needs no trust. The Solana one is not, so it is
 * either taken from the operator's record or re-derived — and in both cases the
 * *EVM sibling of the same path* is checked against the chain. If they disagree
 * the pair does not belong together and only the on-chain address is shown,
 * because a Solana address a reader cannot tie to this vault is worse than none.
 */
async function resolveWallets(
	vault: VaultView,
	record: VaultConfigRecord,
	notes: string[],
): Promise<AgentWallets> {
	const evm = vault.agentWallet;

	const path =
		record?.agentPath ??
		(vault.ticker
			? agentDerivationPath(
					vault.ticker,
					vault.tier === "CONSERVATIVE" ? "conservative" : "leveraged",
				)
			: null);

	if (!path || !clients.nearMpc) {
		if (record?.agentSolanaAddress) {
			// Recorded at creation, when the pair was derived together.
			return {
				evm,
				solana: record.agentSolanaAddress,
				path: record.agentPath,
				derivationVerified: false,
			};
		}
		notes.push(
			"The agent's Solana address cannot be shown: NEAR chain signatures are not configured on this deployment, so it cannot be derived here.",
		);
		return { evm, solana: null, path, derivationVerified: false };
	}

	const derived = clients.nearMpc.derive(path);
	const matches = derived.evmAddress.toLowerCase() === evm.toLowerCase();

	if (!matches) {
		notes.push(
			`Derivation path "${path}" produces ${derived.evmAddress}, but the vault names ${evm} as its agent. The Solana address is withheld rather than shown next to an address it may not belong with.`,
		);
		return { evm, solana: null, path, derivationVerified: false };
	}

	return { evm, solana: derived.solanaAddress, path, derivationVerified: true };
}

/**
 * The spot leg: a token balance on Base, valued at what selling it would clear.
 *
 * The value comes from a live route at the *full holding size*, not a unit price
 * scaled up. On a thin pool those differ by several percent, and the scaled
 * figure describes a position nobody could exit at that price.
 */
async function readSpotLeg(
	vault: VaultView,
	record: VaultConfigRecord,
	notes: string[],
): Promise<SpotLeg> {
	const seed = vault.ticker ? findTokenByTicker(vault.ticker) : undefined;
	const token = (record?.spotTokenAddress ?? seed?.address ?? null) as Address | null;
	const decimals = record?.spotTokenDecimals ?? seed?.decimals ?? null;
	const symbol = record?.spotTokenSymbol ?? seed?.symbol ?? null;

	if (!token || decimals === null) {
		notes.push(
			"The spot leg cannot be read: this vault has no recorded token, and its ticker is not in the curated registry.",
		);
		return { token: null, symbol, decimals: null, balance: "0", valueUsd: null, priceUsd: null };
	}

	let balance = 0n;
	try {
		balance = await baseClient.readContract({
			abi: erc20Abi,
			address: token,
			functionName: "balanceOf",
			args: [vault.agentWallet as Address],
		});
	} catch (error) {
		notes.push(`The spot balance could not be read from Base: ${message(error)}`);
		return { token, symbol, decimals, balance: "0", valueUsd: null, priceUsd: null };
	}

	if (balance === 0n) {
		return { token, symbol, decimals, balance: "0", valueUsd: "0", priceUsd: null };
	}

	try {
		const route = await clients.kyber.getRoute({
			tokenIn: token,
			tokenOut: config.contracts.usdc,
			amountIn: balance.toString(),
			slippagePercent: 0.5,
		});
		// `QuoteResult` is a discriminated union and the amounts live under
		// `quote`. Reaching for `routeSummary` on the envelope reads undefined
		// every time, which priced every spot leg on every vault page at null.
		const valueUsd = route.ok ? BigInt(route.quote.amountOut) : null;

		return {
			token,
			symbol,
			decimals,
			balance: balance.toString(),
			valueUsd: valueUsd === null ? null : valueUsd.toString(),
			priceUsd:
				valueUsd === null ? null : Number(valueUsd) / 1e6 / (Number(balance) / 10 ** decimals),
		};
	} catch (error) {
		// Null, not zero. An unroutable pool is an unknown value, and marking it
		// to zero would understate the vault by its entire spot leg.
		notes.push(
			`The spot leg holds a balance but cannot currently be routed to a price: ${message(error)}`,
		);
		return { token, symbol, decimals, balance: balance.toString(), valueUsd: null, priceUsd: null };
	}
}

/**
 * Everything this page needs from Pacifica, fetched once.
 *
 * One snapshot rather than a fetch per consumer. The perp leg wants the account
 * and the founding market's position; the per-market hedges want every position
 * and every price — the same three responses, and asking for them twice doubles
 * the load on the upstream whose rate limit produced the cache above.
 *
 * `reachable: false` is not the same as an empty account. Both leave the legs
 * reading zero, but only one of them means the numbers are unknown, and the
 * hedge status says so rather than reporting a vault as neutral because
 * Pacifica did not answer.
 */
interface VenueSnapshot {
	reachable: boolean;
	account: PacificaAccountInfo | null;
	positions: PacificaPosition[];
	prices: PacificaPrice[];
}

async function readVenue(solanaAddress: string | null, notes: string[]): Promise<VenueSnapshot> {
	const empty: VenueSnapshot = { reachable: false, account: null, positions: [], prices: [] };
	if (!solanaAddress) return empty;

	try {
		// `prices()`, not `markets()`. The latter returns the market's *spec* —
		// tick size, lot size, leverage caps, funding rate — and carries no mark
		// at all, so the mark read here was undefined on every live vault and the
		// notional, the leverage and now the ADL score all fell out as null.
		const [account, positions, prices] = await Promise.all([
			clients.pacifica.accountInfo(solanaAddress),
			clients.pacifica.positions(solanaAddress),
			clients.pacifica.prices(),
		]);
		return { reachable: true, account, positions, prices };
	} catch (error) {
		notes.push(`The perp leg could not be read from Pacifica: ${message(error)}`);
		return empty;
	}
}

/** The perp leg for the vault's founding market, from the snapshot above. */
function perpLegFrom(venue: VenueSnapshot, record: VaultConfigRecord): PerpLeg {
	const empty: PerpLeg = {
		symbol: record?.perpSymbol ?? null,
		size: 0,
		entryPrice: null,
		markPrice: null,
		notionalUsd: null,
		unrealisedPnlUsd: null,
		marginUsd: null,
		leverage: null,
		fundingRateHourlyPercent: null,
		adl: adlRisk({
			side: "short",
			entryPrice: null,
			markPrice: null,
			size: 0,
			equityUsd: null,
		}),
	};

	if (!venue.reachable) return empty;

	const { positions, prices, account } = venue;
	const symbol = record?.perpSymbol ?? null;
	const position = symbol ? positions.find((p) => p.symbol === symbol) : positions[0];
	const price = prices.find((q) => q.symbol === (position?.symbol ?? symbol));

	// Read through the venue's own types rather than through `any`. The casts
	// that used to be here are what hid the bug below: `p?.unrealized_pnl` is not
	// a field Pacifica's positions endpoint returns, and optional chaining
	// through `any` reads a missing key as `undefined` in silence rather than as
	// a compile error.
	const size = Number(position?.amount ?? 0);
	const entry = finite(position?.entry_price);
	const mark = finite(price?.mark);
	const margin = finite(account?.account_equity);
	const notional = mark !== null ? Math.abs(size) * mark : null;
	const short = position?.side === "ask";

	return {
		symbol: position?.symbol ?? symbol,
		// Negative for a short, which is what a basis position holds. Pacifica
		// reports side separately, so the sign is applied here rather than
		// leaving the reader to work out which way round it is.
		size: short ? -Math.abs(size) : size,
		entryPrice: entry,
		markPrice: mark,
		notionalUsd: notional,
		// Computed, because Pacifica's positions endpoint does not publish it.
		// Every input is already here — entry from the position, mark from the
		// price feed — and the figure this replaces was read from a key that has
		// never existed on the payload, so the panel rendered "—" on every vault
		// that has ever had a position.
		unrealisedPnlUsd: unrealisedPnl({
			entryPrice: entry,
			markPrice: mark,
			size,
			side: short ? "short" : "long",
		}),
		marginUsd: margin,
		leverage: notional !== null && margin ? notional / margin : null,
		fundingRateHourlyPercent: finite(price?.funding) === null ? null : Number(price?.funding) * 100,
		adl: adlRisk({
			side: short ? "short" : "long",
			entryPrice: entry,
			markPrice: mark,
			size,
			// Account equity, which already carries the unrealised profit that
			// puts the position in the queue in the first place.
			equityUsd: margin,
			oraclePrice: finite(price?.oracle),
			price24hAgo: finite(price?.yesterday_price),
		}),
	};
}

/**
 * What the perp leg is up or down, marked against its entry.
 *
 * Pacifica does not publish this. `/positions` returns the entry price, the
 * size and the side and nothing else — there is no `unrealized_pnl` on the
 * payload and there never was — so it is derived from the entry and the live
 * mark, which is the same arithmetic the venue would do.
 *
 * Null rather than zero whenever it cannot be computed. Zero is a real answer
 * meaning "flat against entry", and a missing mark rendered as zero is a
 * confident lie in the place a reader is most likely to trust it; the panel
 * already distinguishes the two and shows a dash for null.
 *
 * A basis vault holds the *short* leg, so a rising underlying shows a loss
 * here. That is the hedge working — the spot leg is up by the same amount — and
 * it is not on its own a reason for alarm.
 */
export function unrealisedPnl(input: {
	entryPrice: number | null;
	markPrice: number | null;
	size: number;
	side: "long" | "short";
}): number | null {
	const { entryPrice, markPrice, size, side } = input;

	// Zero is how the venue reports an absent price, not a real one — no position
	// is ever opened at zero — so it is treated as missing rather than used.
	if (entryPrice === null || markPrice === null) return null;
	if (!(entryPrice > 0) || !(markPrice > 0) || !Number.isFinite(size)) return null;

	const units = Math.abs(size);
	return side === "short" ? (entryPrice - markPrice) * units : (markPrice - entryPrice) * units;
}

// ---------------------------------------------------------------------------
// Per-market hedge drift
// ---------------------------------------------------------------------------

/**
 * The threshold for a vault whose row predates the column.
 *
 * Kept in step with `VaultConfig.rebalanceDriftBps` in the Prisma schema, which
 * is where the reasoning for the number lives, and read by the agent from the
 * same column. A constant here would be a second source of truth; this is only
 * the fallback for a vault with no configuration row at all.
 */
const DEFAULT_REBALANCE_DRIFT_BPS = 500;

/** One market's two legs as read from the chain, before the venue is consulted. */
interface MarketLeg {
	ticker: string;
	spotSymbol: string;
	spotTokenAddress: string;
	spotDecimals: number;
	perpSymbol: string;
	/** Null when the Base balance could not be read — unknown, not zero. */
	spotUnits: number | null;
}

/**
 * Every enabled market's spot balance, in one batch of `balanceOf` calls.
 *
 * Read from the `VaultMarket` rows rather than from the founding-market columns,
 * because a vault may run several and the founding columns describe only the
 * first. A vault whose rows have not been seeded yet falls back to those columns,
 * which say exactly the same thing about a single-market vault — the seeding
 * itself is a write and belongs on the agent's path, not on a depositor's page
 * load.
 */
async function readMarketLegs(
	address: string,
	agent: Address,
	record: VaultConfigRecord,
	notes: string[],
): Promise<MarketLeg[]> {
	const rows = await prisma.vaultMarket
		.findMany({ where: { vaultAddress: address.toLowerCase(), enabled: true } })
		.catch(() => null);

	if (rows === null) {
		notes.push("This vault's market list could not be read, so per-market drift is not shown.");
		return [];
	}

	const configured =
		rows.length > 0
			? rows.map((row) => ({
					ticker: row.ticker,
					spotSymbol: row.spotTokenSymbol,
					spotTokenAddress: row.spotTokenAddress,
					spotDecimals: row.spotTokenDecimals,
					perpSymbol: row.perpSymbol,
				}))
			: record
				? [
						{
							ticker: record.ticker,
							spotSymbol: record.spotTokenSymbol,
							spotTokenAddress: record.spotTokenAddress,
							spotDecimals: record.spotTokenDecimals,
							perpSymbol: record.perpSymbol,
						},
					]
				: [];

	if (configured.length === 0) return [];

	// Issued together so viem's multicall collapses them into one `aggregate3`.
	// A vault with five markets is one Base request, not five.
	return await Promise.all(
		configured.map(async (market) => {
			try {
				const balance = await baseClient.readContract({
					abi: erc20Abi,
					address: market.spotTokenAddress as Address,
					functionName: "balanceOf",
					args: [agent],
				});
				return { ...market, spotUnits: Number(balance) / 10 ** market.spotDecimals };
			} catch (error) {
				notes.push(
					`The ${market.ticker} spot balance could not be read from Base, so its hedge drift is unknown: ${message(error)}`,
				);
				return { ...market, spotUnits: null };
			}
		}),
	);
}

/**
 * Join each market's two legs with the venue's own order constraints.
 *
 * The constraints are the point. `lotSize` and `minOrderUsd` are what decide
 * whether a correction can be *placed*, and they are measured in different
 * things — a quantity grid in units of the underlying, and a floor on the
 * order's dollar notional. Snapping to the first gives no protection against
 * the second, which is how a 0.002-unit correction worth $0.45 was sent to a
 * venue with a $10 minimum on every tick and rejected every time.
 */
async function readMarketHedges(
	legs: MarketLeg[],
	venue: VenueSnapshot,
	rebalanceDriftBps: number,
	notes: string[],
): Promise<MarketHedge[]> {
	if (legs.length === 0) return [];

	// The market catalog behind its own ten-second cache, shared with the board.
	// This page adds no upstream call of its own for it.
	const specs = await getMarkets().catch((error) => {
		notes.push(
			`Pacifica's market specifications could not be read, so whether a rebalance is placeable cannot be judged: ${message(error)}`,
		);
		return null;
	});

	const bySymbol = new Map(
		(specs ?? []).map((market) => [market.pacifica.pacificaSymbol.toUpperCase(), market.pacifica]),
	);

	return legs
		.map((leg) => {
			const spec = bySymbol.get(leg.perpSymbol.toUpperCase());
			const price = venue.prices.find((quote) => quote.symbol === leg.perpSymbol);
			const position = venue.positions.find((row) => row.symbol === leg.perpSymbol);

			return marketHedge({
				ticker: leg.ticker,
				spotSymbol: leg.spotSymbol,
				spotTokenAddress: leg.spotTokenAddress,
				perpSymbol: leg.perpSymbol,
				spotUnits: leg.spotUnits,
				// A basis position's perp leg is always short, so the magnitude is
				// what the spot leg is compared against. Unknown rather than zero
				// when the venue did not answer: a flat hedge and an unreachable
				// venue look identical here and mean opposite things.
				perpUnits: venue.reachable ? Math.abs(Number(position?.amount ?? 0)) : null,
				markPrice: finite(price?.mark) ?? spec?.markPrice ?? null,
				lotSize: spec?.lotSize ?? null,
				minOrderUsd: spec?.minOrderSize ?? null,
				rebalanceDriftBps,
			});
		})
		.sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));
}

export interface MarketHedgeInput {
	ticker: string;
	spotSymbol: string;
	spotTokenAddress: string;
	perpSymbol: string;
	/** Null when the leg could not be read. Unknown is not zero. */
	spotUnits: number | null;
	perpUnits: number | null;
	markPrice: number | null;
	/** Pacifica's quantity increment, in units of the underlying. */
	lotSize: number | null;
	/** Pacifica's minimum order value, in **USD**. Not comparable to `lotSize`. */
	minOrderUsd: number | null;
	rebalanceDriftBps: number;
}

/**
 * Classify one market's hedge: how far apart the legs are, and whether anything
 * can be done about it.
 *
 * The drift arithmetic is `hedgeHealth` from `@lemon/registry` rather than a
 * second copy of it. Two of that function's outputs are deliberately not used:
 * its `exposure` and `shouldRebalance` are judged against a package constant,
 * and the threshold that actually governs this vault is a column on its
 * configuration row — so a vault set to 5% would otherwise be told by the page
 * that it should be rebalancing at 1.2% while its agent sat still, which is the
 * disagreement this whole endpoint exists to remove.
 *
 * `shouldRebalance` is also not sufficient on its own. It checks the lot grid
 * and stops there, and the lot grid is only one of the venue's two floors.
 */
export function marketHedge(input: MarketHedgeInput): MarketHedge {
	const { spotUnits, perpUnits, markPrice, lotSize, minOrderUsd, rebalanceDriftBps } = input;
	const thresholdPercent = rebalanceDriftBps / 100;

	const shared = {
		ticker: input.ticker,
		spotSymbol: input.spotSymbol,
		spotTokenAddress: input.spotTokenAddress,
		perpSymbol: input.perpSymbol,
		markPrice,
		rebalanceDriftBps,
		thresholdPercent,
		lotSize,
		minOrderUsd,
	};

	// A leg that could not be read is reported as unknown rather than as zero.
	// Zero on the perp side reads as a hedge that has vanished — the single most
	// alarming thing this object can say — and an unreachable venue must not be
	// able to say it.
	if (spotUnits === null || perpUnits === null) {
		return {
			...shared,
			spotUnits: spotUnits ?? 0,
			perpUnits: perpUnits ?? 0,
			deltaUnits: 0,
			driftPercent: 0,
			deltaUsd: null,
			exposure: "neutral",
			correctionUnits: 0,
			correctionUsd: null,
			status: "unknown",
		};
	}

	const health = hedgeHealth({
		spotUnits,
		perpUnits,
		markPrice: markPrice ?? 0,
		lotSize: lotSize ?? 0,
	});

	// Spot sold out from under a short that is still open. There is no spot leg
	// to express the gap as a percentage of, and `hedgeHealth` guards the divide
	// by returning zero — which would render a naked short as perfectly neutral.
	// Reported as fully over-hedged instead, matching the agent's own `driftBps`,
	// which saturates at ±100% in the same state.
	const driftPercent = spotUnits === 0 && perpUnits !== 0 ? -100 : health.driftPercent;
	const past = Math.abs(driftPercent) >= thresholdPercent;

	const correctionUsd = markPrice === null ? null : Math.abs(health.correctionUnits * markPrice);

	const status: RebalanceStatus = !past
		? "neutral"
		: markPrice === null || lotSize === null || minOrderUsd === null
			? "unknown"
			: health.correctionUnits === 0
				? "below-lot-size"
				: minOrderUsd > 0 && (correctionUsd ?? 0) < minOrderUsd
					? "below-min-notional"
					: "ready";

	return {
		...shared,
		spotUnits,
		perpUnits,
		deltaUnits: health.deltaUnits,
		driftPercent,
		deltaUsd: markPrice === null ? null : health.deltaUsd,
		// Judged against this vault's threshold, so the word and the status agree.
		// Drift inside the threshold is not exposure the vault is choosing to run.
		exposure: !past ? "neutral" : health.deltaUnits > 0 ? "long" : "short",
		correctionUnits: health.correctionUnits,
		correctionUsd,
		status,
	};
}

async function readAgentUsdc(agent: Address, notes: string[]): Promise<bigint> {
	try {
		return await baseClient.readContract({
			abi: erc20Abi,
			address: config.contracts.usdc,
			functionName: "balanceOf",
			args: [agent],
		});
	} catch (error) {
		notes.push(`USDC held at the agent could not be read: ${message(error)}`);
		return 0n;
	}
}

/**
 * Add the legs up, or refuse.
 *
 * Returns null if either leg is unreadable. A partial total looks like a real
 * number and is not one — and this figure exists specifically to be compared
 * against the reported NAV, so a silently incomplete version of it would
 * manufacture a discrepancy that is not there.
 */
function combine(spotUsd: string | null, marginUsd: number | null, idle: bigint): bigint | null {
	if (spotUsd === null || marginUsd === null) return null;
	return BigInt(spotUsd) + BigInt(Math.round(marginUsd * 1e6)) + idle;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
