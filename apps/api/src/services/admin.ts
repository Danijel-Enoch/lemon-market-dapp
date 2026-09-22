import { DEFAULT_CHAIN_ID, requireChainInfo } from "@lemon/core";
import {
	prisma,
	refFrom,
	type VaultMarketConfig,
	validateWeights,
	vaultMarkets,
	vaultMarketWhere,
	vaultWhere,
} from "@lemon/db";
import { agentDerivationPath } from "@lemon/near-mpc";
import { clients, config } from "../config";
import { listBasisMarkets } from "./basis-markets";
import { listVaults } from "./vaults";

/**
 * The admin side.
 *
 * Two jobs: decide who is an admin, and turn "this market should have a vault"
 * into the two things that have to happen together — a derived agent wallet and
 * a factory transaction naming it.
 */

export class AdminError extends Error {
	readonly status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.name = "AdminError";
		this.status = status;
	}
}

/**
 * Seed the admin table from the environment, once.
 *
 * The first admin has to come from somewhere, and a deployment with no admins is
 * a deployment where no vault can ever be created. Subsequent changes happen in
 * the database — env is the bootstrap, not the source of truth, so removing an
 * address from `ADMIN_ADDRESSES` does not silently revoke someone.
 */
export async function seedAdmins(): Promise<void> {
	if (config.bootstrapAdmins.length === 0) return;
	await Promise.all(
		config.bootstrapAdmins.map((address) =>
			prisma.adminUser.upsert({
				where: { address },
				update: {},
				create: { address, canCreateVaults: true, label: "bootstrap" },
			}),
		),
	);
}

export async function isAdmin(address: string): Promise<boolean> {
	const record = await prisma.adminUser.findUnique({
		where: { address: address.toLowerCase() },
	});
	return record !== null;
}

export async function assertAdmin(address: string | undefined): Promise<void> {
	if (!address) throw new AdminError("Sign in to reach the admin dashboard.", 401);
	if (!(await isAdmin(address))) {
		// 404, not 403. Telling an unauthorised caller that the route exists tells
		// them what to attack next.
		throw new AdminError("Not found", 404);
	}
}

export async function assertCanCreateVaults(address: string | undefined): Promise<void> {
	await assertAdmin(address);
	const record = await prisma.adminUser.findUnique({
		where: { address: (address as string).toLowerCase() },
	});
	if (!record?.canCreateVaults) {
		throw new AdminError("This admin account cannot create vaults.", 403);
	}
}

// ---------------------------------------------------------------------------
// The market board, annotated with what already has a vault
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
		/** True when the routability probe could not answer, so `buyable` is a guess. */
		probeFailed: boolean;
		/** When routability was last checked, or null if it never has been. */
		checkedAt: number | null;
	};
	perp: { pacificaSymbol: string };
	/** Vaults that already exist for this market, by tier. */
	existing: { conservative: string | null; leveraged: string | null };
	/** Why this market cannot have a vault created right now. Empty means it can. */
	reasons: string[];
	/**
	 * Whether the spot leg can be round-tripped on Base right now.
	 *
	 * The vault's whole job is to hold a spot position on Base against a perp
	 * short, so a market whose Base token cannot be bought — or can be bought and
	 * not sold — is one whose vault would take deposits and then be unable to open
	 * or unwind. Both directions are required: enterable-but-not-exitable is the
	 * worse failure, because the money is already in by the time it is discovered.
	 *
	 * A failed probe is *not* reported as untradable. Throttled liquidity checks
	 * would otherwise take the whole board off the create list at exactly the
	 * moment an operator is least able to tell why.
	 *
	 * Named for the leg, not for Base. It was `spotTradableOnBase` while Base was
	 * the only chain, and the name outlived that — the admin console rendered
	 * "No spot on Base" against an X Layer board, which reads as the check being
	 * pointed at the wrong chain rather than as a stale label.
	 */
	spotTradable: boolean;
}

/**
 * The markets a vault could be created for, on one chain.
 *
 * Chain-scoped because the spot leg is. The three chains do not offer the same
 * board at all: Base has the Coinbase B20 equities, X Layer has its own `w…x`
 * equity family and the `x…` crypto set, and Arbitrum has no tokenized
 * equities whatsoever — only crypto. An operator creating an Arbitrum vault
 * must not be offered NVDA, because there is nothing on Arbitrum to buy for it.
 */
export async function listVaultableMarkets(
	chainId: number = DEFAULT_CHAIN_ID,
): Promise<VaultableMarket[]> {
	const chain = requireChainInfo(chainId);
	const [board, vaults] = await Promise.all([listBasisMarkets(chainId), listVaults()]);

	const { keccak256, toBytes } = await import("viem");

	/**
	 * Indexed by `marketId`, not by ticker.
	 *
	 * The ticker on a vault comes from its venue configuration, which lives in
	 * Postgres and can be absent — a vault deployed outside this dashboard has
	 * none — or, before `recordVault` verified what it was writing, wrong. Either
	 * way the market looked unvaulted here, the console offered to create a
	 * second vault for it, and the factory refused with a revert the operator had
	 * to decode.
	 *
	 * `marketId` is set in the vault's constructor, is immutable, and is exactly
	 * `keccak256(ticker)` — so it answers the question "does this market already
	 * have a vault" from the chain, which is where the answer actually lives.
	 */
	const byMarketId = new Map<string, { conservative: string | null; leveraged: string | null }>();
	for (const vault of vaults) {
		const key = vault.marketId?.toLowerCase();
		if (!key) continue;
		const entry = byMarketId.get(key) ?? { conservative: null, leveraged: null };
		if (vault.tier === "CONSERVATIVE") entry.conservative = vault.address;
		else entry.leveraged = vault.address;
		byMarketId.set(key, entry);
	}

	return board.markets.map((market) => {
		const existing = byMarketId.get(
			keccak256(toBytes(market.ticker.toUpperCase())).toLowerCase(),
		) ?? {
			conservative: null,
			leveraged: null,
		};

		const reasons: string[] = [];
		// The market board's own blockers carry forward. A market nobody can
		// trade is a market whose vault would take deposits and sit idle.
		if (market.blockers.length) reasons.push(...market.blockers);

		// A probe that has not run is not a probe that found nothing.
		//
		// An unprobed token reports `buyable: false` with `probeFailed: false`
		// (the `?? false` defaults in `spot.ts`), so testing `probeFailed` alone
		// turns missing data into a confident "no route" — and takes every market
		// off the create list for as long as the first sweep is still running.
		// `checkedAt` is the only field that separates the two.
		const probed = !market.spot.probeFailed && market.spot.checkedAt !== null;

		const spotTradable = probed && market.spot.buyable && market.spot.sellable;

		// The chain is named, not assumed. These sentences are read by an operator
		// deciding whether a chain is broken or a token simply is not routable
		// there, and one that says "Base" under an X Layer board answers neither.
		if (probed && !market.spot.buyable) {
			reasons.push(
				`No route into ${market.spot.symbol} on ${chain.name}, so the spot leg cannot be opened.`,
			);
		} else if (probed && !market.spot.sellable) {
			reasons.push(
				`${market.spot.symbol} can be bought but not sold on ${chain.name}, so the position could not be unwound.`,
			);
		}

		return {
			id: market.id,
			ticker: market.ticker,
			name: market.name,
			assetClass: market.assetClass,
			netApyPercent: market.economics.netApyPercent,
			fundingAprPercent: market.economics.fundingAprPercent,
			blockers: market.blockers,
			spot: {
				symbol: market.spot.symbol,
				address: market.spot.address,
				decimals: market.spot.decimals,
				buyable: market.spot.buyable,
				sellable: market.spot.sellable,
				probeFailed: market.spot.probeFailed,
				checkedAt: market.spot.checkedAt,
			},
			perp: { pacificaSymbol: market.perp.pacificaSymbol },
			existing,
			reasons,
			spotTradable,
		};
	});
}

// ---------------------------------------------------------------------------
// Creating a vault
// ---------------------------------------------------------------------------

export interface PreparedVault {
	ticker: string;
	tier: "conservative" | "leveraged";
	/**
	 * The chain the vault will be deployed on.
	 *
	 * Part of the prepared vault rather than supplied again at record time,
	 * because it is already baked into `agentPath` by the time the operator sees
	 * this. Passing it twice would let the two disagree, and the shape of that
	 * disagreement is a vault row on one chain holding the agent wallet derived
	 * for another — which is not detectable after the fact.
	 */
	chainId: number;
	/** `keccak256(ticker)`, which is what the factory stores. */
	marketId: `0x${string}`;
	agentPath: string;
	agentEvmAddress: `0x${string}`;
	agentSolanaAddress: string;
	name: string;
	symbol: string;
	targetLeverageBps: number;
	maxLeverageBps: number;
}

/**
 * Work out what a new vault would be, without creating it.
 *
 * The agent address has to be known *before* the vault exists, because the vault
 * bakes it in at construction and cannot change it. So the flow is: derive here,
 * show the operator exactly which wallet is about to be handed the capital, and
 * only then send the factory transaction.
 *
 * Showing the address first is not ceremony. It is the one moment anybody looks
 * at the wallet that will hold the entire position, and a dashboard that skipped
 * straight to "created" would never surface it.
 */
export async function prepareVault(params: {
	ticker: string;
	tier: "conservative" | "leveraged";
	/** Which chain to deploy on. Defaults to this deployment's primary chain. */
	chainId?: number;
	targetLeverageBps?: number;
	maxLeverageBps?: number;
}): Promise<PreparedVault> {
	const { keccak256, toBytes } = await import("viem");

	if (!clients.nearMpc) {
		throw new AdminError(
			"NEAR chain signatures are not configured, so an agent wallet cannot be derived. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY.",
			503,
		);
	}

	const ticker = params.ticker.trim().toUpperCase();
	if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) {
		throw new AdminError(`"${params.ticker}" is not a usable ticker.`);
	}

	const conservative = params.tier === "conservative";
	const targetLeverageBps = conservative ? 10_000 : (params.targetLeverageBps ?? 20_000);
	const maxLeverageBps = conservative ? 10_000 : (params.maxLeverageBps ?? 30_000);

	// Checked here as well as in the contract so the operator gets a sentence
	// rather than a reverted transaction.
	if (!conservative && (targetLeverageBps <= 10_000 || maxLeverageBps > 30_000)) {
		throw new AdminError(
			"A leveraged vault must target above 1x and may not exceed 3x. A vault that sits at 1x is the conservative product under a riskier label.",
		);
	}
	if (maxLeverageBps < targetLeverageBps) {
		throw new AdminError("The leverage ceiling cannot be below the target.");
	}

	// `requireChainInfo` rather than a fallback: an unknown id here would derive a
	// wallet from a path naming a chain that does not exist, and the operator
	// would be shown a perfectly valid-looking address to fund.
	const chain = requireChainInfo(params.chainId ?? DEFAULT_CHAIN_ID);

	const agentPath = agentDerivationPath(ticker, params.tier, chain.key);
	const derived = clients.nearMpc.derive(agentPath);

	const existing = await prisma.vaultConfig.findFirst({ where: { agentPath } });
	if (existing) {
		throw new AdminError(
			`A ${params.tier} vault for ${ticker} already exists at ${existing.address} on chain ${existing.chainId}. One market, tier and chain gets one vault, and one agent.`,
			409,
		);
	}

	return {
		ticker,
		tier: params.tier,
		chainId: chain.id,
		marketId: keccak256(toBytes(ticker)),
		agentPath,
		agentEvmAddress: derived.evmAddress,
		agentSolanaAddress: derived.solanaAddress,
		name: `Lemon ${ticker} Basis ${conservative ? "Conservative" : "Leveraged"}`,
		symbol: `lm${ticker}${conservative ? "C" : "L"}`,
		targetLeverageBps,
		maxLeverageBps,
	};
}

/**
 * Record a vault the operator has deployed.
 *
 * The factory transaction is sent by the admin's own wallet from the browser,
 * not by this server. That is the right split: creating a vault commits capital
 * and names an agent, and it should carry a human signature rather than being
 * something a compromised API key can do. This records the result so the agent
 * can find its configuration.
 */
/**
 * Check the vault at `address` is the vault this configuration is about.
 *
 * The dashboard sends an address and a market, and until this existed the
 * server believed both. It is a three-step flow across two systems — derive,
 * deploy, record — and any interruption between the second and third leaves the
 * operator retrying from a page whose in-memory idea of "which market" can no
 * longer be assumed to match the transaction that actually landed. The failure
 * is silent and permanent: the contract says one market, the database says
 * another, and the agent trades the database's answer with the contract's
 * capital.
 *
 * So the chain is asked. `marketId` is immutable and set in the constructor, so
 * it is the one field that cannot have drifted.
 */
async function assertVaultMatches(address: string, prepared: PreparedVault): Promise<void> {
	const { keccak256, toBytes } = await import("viem");
	const { lemonVaultAbi } = await import("@lemon/contracts");
	const { clientFor } = await import("../chain");

	/**
	 * Read on the vault's own chain, not on Base.
	 *
	 * This used `baseClient`, which made the check a Base-only one: a vault
	 * deployed anywhere else read as no contract at all, and the guard reported
	 * "No vault could be read" for a vault that had just been created
	 * successfully. The gas was spent, the vault existed, and its configuration
	 * was refused — the one failure this whole flow is arranged to avoid, since
	 * an unconfigured vault is one the agent will not trade.
	 *
	 * `prepared.chainId` is the right source: it is already baked into
	 * `agentPath`, which is why it travels with the prepared vault rather than
	 * being passed again here.
	 */
	const client = clientFor(prepared.chainId);

	const expectedMarketId = keccak256(toBytes(prepared.ticker));
	const vault = { address: address as `0x${string}`, abi: lemonVaultAbi } as const;

	let onChain: { marketId: string; agentWallet: string };
	try {
		const [marketId, agentWallet] = await Promise.all([
			client.readContract({ ...vault, functionName: "marketId" }),
			client.readContract({ ...vault, functionName: "agentWallet" }),
		]);
		onChain = { marketId, agentWallet };
	} catch {
		throw new AdminError(
			`No vault could be read at ${address}. Nothing was recorded — check the transaction landed before retrying.`,
			409,
		);
	}

	if (onChain.marketId.toLowerCase() !== expectedMarketId.toLowerCase()) {
		throw new AdminError(
			`The vault at ${address} is not the ${prepared.ticker} vault — its marketId does not match. Nothing was recorded, which is deliberate: an agent reads this configuration and would have traded ${prepared.ticker} with that vault's capital.`,
			409,
		);
	}

	if (onChain.agentWallet.toLowerCase() !== prepared.agentEvmAddress.toLowerCase()) {
		throw new AdminError(
			`The vault at ${address} names a different agent wallet than the one derived for ${prepared.ticker}. Nothing was recorded.`,
			409,
		);
	}
}

export async function recordVault(params: {
	address: string;
	prepared: PreparedVault;
	spotTokenAddress: string;
	spotTokenDecimals: number;
	spotTokenSymbol: string;
	perpSymbol: string;
	/** The market's asset class, so the board does not have to fall back to a table. */
	assetClass?: string;
	createdBy: string;
}) {
	await assertVaultMatches(params.address, params.prepared);

	const address = params.address.toLowerCase();

	// The founding market is written as a `VaultMarket` row in the same
	// transaction as the vault's configuration, not left to be seeded on first
	// read. A vault created through this flow has an operator watching it, and
	// "the markets appear once the agent has ticked" is a worse thing to explain
	// than one extra write.
	const [record] = await prisma.$transaction([
		prisma.vaultConfig.create({
			data: {
				address,
				chainId: params.prepared.chainId,
				ticker: params.prepared.ticker,
				riskTier: params.prepared.tier === "conservative" ? "CONSERVATIVE" : "LEVERAGED",
				agentPath: params.prepared.agentPath,
				agentEvmAddress: params.prepared.agentEvmAddress.toLowerCase(),
				agentSolanaAddress: params.prepared.agentSolanaAddress,
				spotTokenAddress: params.spotTokenAddress.toLowerCase(),
				spotTokenDecimals: params.spotTokenDecimals,
				spotTokenSymbol: params.spotTokenSymbol,
				perpSymbol: params.perpSymbol,
				assetClass: toVaultAssetClass(params.assetClass),
				createdBy: params.createdBy.toLowerCase(),
			},
		}),
		prisma.vaultMarket.create({
			data: {
				chainId: params.prepared.chainId,
				vaultAddress: address,
				ticker: params.prepared.ticker,
				spotTokenAddress: params.spotTokenAddress.toLowerCase(),
				spotTokenDecimals: params.spotTokenDecimals,
				spotTokenSymbol: params.spotTokenSymbol,
				perpSymbol: params.perpSymbol,
				targetWeightBps: 10_000,
			},
		}),
	]);

	return record;
}

// ---------------------------------------------------------------------------
// The markets a vault runs
// ---------------------------------------------------------------------------

/**
 * Read a vault's markets, seeding the founding one if the vault predates them.
 *
 * The seeding lives in `@lemon/db` so the agent and this API cannot disagree
 * about what a vault with no `VaultMarket` rows means.
 */
export async function listVaultMarkets(
	address: string,
	chainId?: number,
): Promise<VaultMarketConfig[]> {
	const existing = await assertConfigured(address, chainId);
	return vaultMarkets({ chainId: existing.chainId, address: existing.address });
}

/**
 * Replace the set of markets a vault runs.
 *
 * The whole set at once rather than add/remove/reweight endpoints, because the
 * weights are only meaningful together: three requests that each individually
 * look reasonable can leave a vault weighted to 140% between the second and the
 * third, and an agent ticking in that window deploys against it.
 *
 * **Removal is disabling, never deleting.** A vault can hold a position in a
 * market an operator has changed their mind about, and a deleted row is a
 * position the agent can no longer see, value, or sell — it would vanish from
 * the NAV while the tokens sat in the agent's wallet. Disabled instead: the
 * market keeps its row, its target weight is read as zero, and that makes it the
 * most overweight market the vault has, so the next unwind drains it first and a
 * close order sells it like any other. It comes back on with its old weight if
 * an operator changes their mind again.
 *
 * The pairing is resolved here, from the same curated board the create flow
 * uses. The caller sends tickers and weights and nothing else — a request that
 * could name its own token address would be a way to point a live vault's agent
 * at an arbitrary ERC-20.
 */
export async function setVaultMarkets(params: {
	address: string;
	/** Omitted, the address is resolved — and refused if it names more than one vault. */
	chainId?: number;
	markets: Array<{ ticker: string; targetWeightBps: number }>;
}): Promise<VaultMarketConfig[]> {
	const address = params.address.toLowerCase();
	const vault = await assertConfigured(address, params.chainId);

	const requested = params.markets.map((m) => ({
		ticker: m.ticker.trim().toUpperCase(),
		targetWeightBps: m.targetWeightBps,
	}));

	const invalid = validateWeights(requested);
	if (invalid) throw new AdminError(invalid);

	// Resolved before anything is written, so a set naming one unlistable market
	// leaves the vault exactly as it was rather than half-applied.
	const board = await listBasisMarkets(vault.chainId);
	const resolved = requested.map((market) => {
		const listed = board.markets.find((m) => m.ticker.toUpperCase() === market.ticker);
		if (!listed) {
			throw new AdminError(
				`${market.ticker} is not a listed basis market, so there is no curated pairing for it. A vault's agent must never resolve a token from a ticker.`,
			);
		}
		if (listed.blockers.length > 0) {
			throw new AdminError(
				`${market.ticker} cannot be traded right now: ${listed.blockers[0]}. Adding it would give the vault a market it can take capital for and not deploy.`,
			);
		}
		return { ...market, listed };
	});

	// Seeded first, so a vault that predates `VaultMarket` has its founding
	// market as a row before the diff below decides what to disable — otherwise
	// the founding market would be silently dropped rather than disabled.
	const ref = { chainId: vault.chainId, address: vault.address };
	await vaultMarkets(ref);
	const existing = await prisma.vaultMarket.findMany({
		where: { chainId: ref.chainId, vaultAddress: ref.address },
	});
	const keep = new Set(resolved.map((m) => m.ticker));

	await prisma.$transaction([
		...resolved.map((market) =>
			prisma.vaultMarket.upsert({
				where: vaultMarketWhere(ref, market.ticker),
				update: {
					targetWeightBps: market.targetWeightBps,
					enabled: true,
					seeded: false,
					// Re-resolved on every write rather than left as it was. The
					// curated pairing is the thing that must not go stale, and a
					// re-listing under a new token address should reach a live vault.
					spotTokenAddress: market.listed.spot.address.toLowerCase(),
					spotTokenDecimals: market.listed.spot.decimals,
					spotTokenSymbol: market.listed.spot.symbol,
					perpSymbol: market.listed.perp.pacificaSymbol,
				},
				create: {
					chainId: ref.chainId,
					vaultAddress: ref.address,
					ticker: market.ticker,
					targetWeightBps: market.targetWeightBps,
					spotTokenAddress: market.listed.spot.address.toLowerCase(),
					spotTokenDecimals: market.listed.spot.decimals,
					spotTokenSymbol: market.listed.spot.symbol,
					perpSymbol: market.listed.perp.pacificaSymbol,
				},
			}),
		),
		...existing
			.filter((row) => !keep.has(row.ticker) && row.enabled)
			.map((row) => prisma.vaultMarket.update({ where: { id: row.id }, data: { enabled: false } })),
	]);

	return vaultMarkets(ref);
}

// ---------------------------------------------------------------------------
// Closing a vault's positions
// ---------------------------------------------------------------------------

/**
 * Tell a vault's agent to close every position and send all of it back.
 *
 * Deliberately not the same lever as `setAgentEnabled`. A stopped agent stops
 * *reporting*, which stales the NAV and blocks deposits and — worse — blocks the
 * withdrawal queue that an operator unwinding a vault is usually trying to
 * serve. Under a close order the agent keeps ticking: it reports NAV, it fulfils
 * redemptions, it simply holds no position and opens no new one.
 *
 * The order stands until it is lifted. Nothing here waits for the close to
 * happen — it cannot, because closing is minutes of venue round trips across two
 * chains — so this records the instruction and the agent acts on its next tick.
 * `closeCompletedAt` is stamped by the agent when it first finds the vault flat.
 */
export async function setCloseOrder(params: {
	address: string;
	/** Omitted, the address is resolved — and refused if it names more than one vault. */
	chainId?: number;
	closing: boolean;
	reason?: string;
	by: string;
}) {
	const address = params.address.toLowerCase();
	const existing = await assertConfigured(address, params.chainId);
	const where = vaultWhere({ chainId: existing.chainId, address });

	if (!params.closing) {
		return prisma.vaultConfig.update({
			where,
			data: {
				closeRequestedAt: null,
				closeRequestedBy: null,
				closeCompletedAt: null,
				// The reason survives the order being lifted. "Who unwound this vault
				// in March and why" is a question that gets asked long after the
				// answer has left anyone's memory.
				closeReason: existing.closeReason,
			},
		});
	}

	return prisma.vaultConfig.update({
		where,
		data: {
			closeRequestedAt: new Date(),
			closeRequestedBy: params.by.toLowerCase(),
			closeReason: params.reason?.trim() || null,
			// Cleared, because this is a fresh order. A vault re-opened and closed
			// again should not report itself already satisfied from last time.
			closeCompletedAt: null,
		},
	});
}

/**
 * The vault's configuration, or the error that explains its absence.
 *
 * Shared by everything an operator can do to a live vault. Letting Prisma's
 * "record not found" escape instead reaches the generic handler as a database
 * fault and is reported as "the database is unavailable or out of date", which
 * is both wrong and actively misleading — the database is fine, the vault simply
 * has no configuration because it was deployed outside this dashboard.
 */
async function assertConfigured(address: string, chainId?: number) {
	const lower = address.toLowerCase();

	/**
	 * Resolved rather than defaulted when the caller did not say which chain.
	 *
	 * An operator pasting an address into the console usually has one vault in
	 * mind and no reason to think about chains. Resolving serves that case, and
	 * the ambiguous case gets a sentence naming both chains instead of an
	 * arbitrary pick — because every admin action below this point *writes*, and
	 * "stand the agent down" aimed at the wrong chain's vault stops a healthy
	 * vault while leaving the intended one running.
	 */
	const resolved = await refFrom(lower, chainId);
	if (!resolved.ok && resolved.reason === "ambiguous") {
		throw new AdminError(resolved.message, 409);
	}

	const existing = resolved.ok
		? await prisma.vaultConfig.findUnique({ where: vaultWhere(resolved.ref) })
		: null;

	if (!existing) {
		throw new AdminError(
			`No venue configuration exists for ${address}. The vault is deployed and holding funds, but it was created outside this dashboard — record its spot token and perp symbol before an agent can trade it.`,
			409,
		);
	}
	return existing;
}

/**
 * Stand an agent down, or bring it back.
 *
 * Checks the row exists first rather than letting Prisma's "record not found"
 * escape. That error reaches the generic handler as a database fault and is
 * reported to the operator as "the database is unavailable or out of date",
 * which is both wrong and actively misleading — the database is fine, the vault
 * simply has no configuration because it was deployed outside this dashboard.
 */
export async function setAgentEnabled(address: string, enabled: boolean, chainId?: number) {
	const normalised = address.toLowerCase();
	const existing = await assertConfigured(normalised, chainId);

	return prisma.vaultConfig.update({
		where: vaultWhere({ chainId: existing.chainId, address: normalised }),
		data: { agentEnabled: enabled },
	});
}

/** Recent agent ticks, for the operator to see why a vault did or did not act. */
export async function recentRuns(vaultAddress?: string, limit = 50) {
	return prisma.agentRun.findMany({
		where: vaultAddress ? { vaultAddress: vaultAddress.toLowerCase() } : undefined,
		orderBy: { createdAt: "desc" },
		take: Math.min(limit, 200),
	});
}

/**
 * Map a market's asset class onto the enum the database stores.
 *
 * Unrecognised values become `UNKNOWN` rather than being rejected. A new asset
 * class arriving from the market catalog should put a vault in the "other" tab,
 * not stop it being created.
 */
function toVaultAssetClass(value: string | undefined) {
	const upper = (value ?? "").toUpperCase();
	const known = ["CRYPTO", "EQUITY", "RWA", "FX", "COMMODITY", "METAL", "INDEX"];
	return (known.includes(upper) ? upper : "UNKNOWN") as
		| "CRYPTO"
		| "EQUITY"
		| "RWA"
		| "FX"
		| "COMMODITY"
		| "METAL"
		| "INDEX"
		| "UNKNOWN";
}
