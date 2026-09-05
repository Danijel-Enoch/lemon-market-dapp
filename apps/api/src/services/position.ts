import { type AdlRisk, adlRisk } from "@lemon/core";
import { prisma } from "@lemon/db";
import { agentDerivationPath } from "@lemon/near-mpc";
import { findTokenByTicker } from "@lemon/registry";
import { type Address, createPublicClient, erc20Abi, http } from "viem";
import { clients, config } from "../config";
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

export interface LivePosition {
	vault: string;
	wallets: AgentWallets;
	spot: SpotLeg;
	perp: PerpLeg;
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

export async function getLivePosition(address: string): Promise<LivePosition | null> {
	const vault = await getVault(address);
	if (!vault) return null;

	const notes: string[] = [];
	const record = await prisma.vaultConfig
		.findUnique({ where: { address: address.toLowerCase() } })
		.catch(() => null);

	const wallets = await resolveWallets(vault, record, notes);

	const spot = await readSpotLeg(vault, record, notes);
	const perp = await readPerpLeg(wallets.solana, record, notes);
	const idle = await readAgentUsdc(vault.agentWallet as Address, notes);
	const inFlight = await readInFlight(address, notes);

	const observed = combine(spot.valueUsd, perp.marginUsd, idle + inFlight);
	const reported = BigInt(vault.deployedAssets);

	return {
		vault: vault.address,
		wallets,
		spot,
		perp,
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
		const client = createPublicClient({ transport: http(config.baseRpcUrl) });
		balance = await client.readContract({
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

/** The perp leg, from Pacifica's public account API. */
async function readPerpLeg(
	solanaAddress: string | null,
	record: VaultConfigRecord,
	notes: string[],
): Promise<PerpLeg> {
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

		const symbol = record?.perpSymbol ?? null;
		const position = symbol ? positions.find((p) => p.symbol === symbol) : positions[0];
		const price = prices.find((q) => q.symbol === (position?.symbol ?? symbol));

		// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
		const p = position as any;
		// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
		const a = account as any;

		const size = Number(p?.amount ?? 0);
		const entry = finite(p?.entry_price);
		const mark = finite(price?.mark);
		const margin = finite(a?.account_equity);
		const notional = mark !== null ? Math.abs(size) * mark : null;
		const short = p?.side === "ask" || p?.side === "short";

		return {
			symbol: position?.symbol ?? symbol,
			// Negative for a short, which is what a basis position holds. Pacifica
			// reports side separately, so the sign is applied here rather than
			// leaving the reader to work out which way round it is.
			size: short ? -Math.abs(size) : size,
			entryPrice: entry,
			markPrice: mark,
			notionalUsd: notional,
			unrealisedPnlUsd: finite(p?.unrealized_pnl),
			marginUsd: margin,
			leverage: notional !== null && margin ? notional / margin : null,
			fundingRateHourlyPercent:
				finite(price?.funding) === null ? null : Number(price?.funding) * 100,
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
	} catch (error) {
		notes.push(`The perp leg could not be read from Pacifica: ${message(error)}`);
		return empty;
	}
}

async function readAgentUsdc(agent: Address, notes: string[]): Promise<bigint> {
	try {
		const client = createPublicClient({ transport: http(config.baseRpcUrl) });
		return await client.readContract({
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
