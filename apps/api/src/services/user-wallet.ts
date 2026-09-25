import { prisma } from "@lemon/db";
import { derivationPath } from "@lemon/near-mpc";
import { isAccountNotFound } from "@lemon/pacifica";
import {
	associatedTokenAddress,
	MINIMUM_DEPOSIT_USDC,
	readSolanaCosts,
	USDC_MINT,
} from "@lemon/pacifica/deposit";
import { Connection, PublicKey } from "@solana/web3.js";
import { clients, config } from "../config";

/**
 * The wallet a self-managing user trades their perp leg from.
 *
 * This exists because of one stubborn fact: Pacifica is on Solana and keys every
 * balance by the Ed25519 address that signed the deposit. A basis trader coming
 * from an EVM wallet therefore needs a Solana account before they can short
 * anything — and asking them to install a second wallet, fund it with SOL, and
 * keep the two in sync is most of the reason people do not run this trade
 * themselves.
 *
 * So the app derives one for them through NEAR chain signatures, from the EVM
 * address they already connected. No seed phrase, no second install, and the
 * address is a pure function of their wallet — lose this database entirely and
 * the same connected wallet still derives the same Solana account, still holding
 * the same margin.
 *
 * ## What this is not
 *
 * It is not self-custody of the perp leg, and the app must not imply otherwise.
 * The MPC network signs for a path when *our* relayer account asks it to, so a
 * compromise of `NEAR_ACCOUNT_ID`'s access key is a compromise of every derived
 * wallet. That is the same trust boundary the vault agents sit behind, and it is
 * the reason the spot leg deliberately does **not** live here: that leg stays in
 * the user's own wallet, where we cannot reach it, and it is the larger half of
 * the position.
 *
 * The honest summary, which is what the UI says: your spot is yours; your margin
 * is held at an address we can sign for, and you can withdraw it at any time.
 */

/** Anything that stops this deployment deriving wallets at all. */
export function walletsUnavailableReason(): string | null {
	if (!config.databaseUrl) {
		return "Accounts are unconfigured on this deployment: DATABASE_URL is not set.";
	}
	if (!clients.nearMpc) {
		return "Derived wallets are unconfigured on this deployment: NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are not set.";
	}
	return null;
}

export class WalletUnavailableError extends Error {
	constructor(readonly reason: string) {
		super(reason);
		this.name = "WalletUnavailableError";
	}
}

/**
 * A derived wallet's addresses and its onboarding state.
 *
 * `path` is included on purpose. It is the only durable link between a
 * connected wallet and the funds these addresses hold, so it belongs somewhere
 * a user can copy it from rather than being an implementation detail they could
 * not recover if the app disappeared.
 */
export interface UserWalletSummary {
	path: string;
	solanaAddress: string;
	evmAddress: string;
	/** The USDC token account the Solana address deposits from. */
	tokenAccount: string;
	/**
	 * Whether that token account exists on-chain yet.
	 *
	 * Worth surfacing before a bridge rather than after. Creating it costs rent
	 * that a wallet holding only USDC cannot pay, so a fee payer covers it — and
	 * a deployment whose fee payer is empty fails at exactly the moment the
	 * user's money is mid-crossing.
	 */
	tokenAccountReady: boolean;
	/** Whether the user has approved this deployment's Pacifica builder code. */
	builderCodeApproved: boolean;
	createdAt: string;
}

/**
 * Derive — and record, once — the wallet for a signed-in user.
 *
 * Idempotent by construction: derivation is pure, so the second call recomputes
 * exactly what the first stored. The stored row is not a cache of the addresses
 * but a witness of what was derived, which is what makes the mismatch check
 * below possible at all.
 */
export async function ensureUserWallet(params: {
	userId: string;
	address: string;
}): Promise<UserWalletSummary> {
	const unavailable = walletsUnavailableReason();
	if (unavailable) throw new WalletUnavailableError(unavailable);

	const mpc = clients.nearMpc;
	if (!mpc) throw new WalletUnavailableError("NEAR chain signatures are not configured.");

	const path = derivationPath(params.address);
	const derived = mpc.derive(path);

	const existing = await prisma.userWallet.findUnique({ where: { userId: params.userId } });

	if (existing) {
		/**
		 * The guard this table exists for.
		 *
		 * `NEAR_ACCOUNT_ID` is an input to derivation, so changing it repoints
		 * every user at a fresh, empty address. Left undetected that presents as
		 * a Pacifica account emptied overnight — the worst possible framing of a
		 * configuration change, and one a user would reasonably report as theft.
		 * Refusing here names the actual cause and keeps the old addresses on
		 * record, which is what a recovery would need.
		 */
		if (existing.derivedUnder !== mpc.accountId) {
			throw new WalletUnavailableError(
				`This account's wallet was derived under NEAR account "${existing.derivedUnder}" and this deployment is configured as "${mpc.accountId}". Those derive different addresses, so any balance shown would not be yours. The funds are still at ${existing.solanaAddress}; restore NEAR_ACCOUNT_ID to reach them.`,
			);
		}

		return toSummary(existing);
	}

	const created = await prisma.userWallet.create({
		data: {
			userId: params.userId,
			path,
			solanaAddress: derived.solanaAddress,
			evmAddress: derived.evmAddress,
			derivedUnder: mpc.accountId,
		},
	});

	return toSummary(created);
}

/** The wallet a user already has, or null when they have never opened a position. */
export async function getUserWallet(userId: string): Promise<UserWalletSummary | null> {
	if (walletsUnavailableReason()) return null;
	const record = await prisma.userWallet.findUnique({ where: { userId } });
	return record ? toSummary(record) : null;
}

function toSummary(record: {
	path: string;
	solanaAddress: string;
	evmAddress: string;
	tokenAccountReadyAt: Date | null;
	builderCodeApprovedAt: Date | null;
	createdAt: Date;
}): UserWalletSummary {
	return {
		path: record.path,
		solanaAddress: record.solanaAddress,
		evmAddress: record.evmAddress,
		tokenAccount: associatedTokenAddress(new PublicKey(record.solanaAddress), USDC_MINT).toBase58(),
		tokenAccountReady: record.tokenAccountReadyAt !== null,
		builderCodeApproved: record.builderCodeApprovedAt !== null,
		createdAt: record.createdAt.toISOString(),
	};
}

/**
 * What a user has to work with, across all three places their money can sit.
 *
 * Read live from each venue every time rather than cached, because every one of
 * these numbers is the input to a decision about committing capital, and a
 * stale margin figure is how someone opens a position they cannot cover.
 */
export interface UserBalances {
	solana: {
		address: string;
		/** USDC sitting in the derived wallet, bridged but not yet deposited. */
		idleUsdc: string;
		/** Whether the token account exists. Zero balance means both things otherwise. */
		tokenAccountReady: boolean;
	};
	pacifica: {
		account: string;
		/** True once Pacifica has seen a deposit. Until then the account does not exist. */
		registered: boolean;
		/** Total account value, 6dp. Null when unregistered. */
		equityUsdc: string | null;
		/** Margin not backing a position, 6dp — what a new position can draw on. */
		availableUsdc: string | null;
		/** Margin currently backing open positions, 6dp. */
		usedUsdc: string | null;
	};
	/**
	 * The minimums Pacifica enforces, carried alongside the balances they
	 * constrain so the UI never has to hardcode them.
	 *
	 * These are the numbers users ask about most and the ones most often wrong in
	 * a frontend: a deposit below the minimum is accepted by the bridge and
	 * rejected on arrival, which strands USDC on Solana with no obvious cause.
	 */
	minimums: {
		/** Pacifica rejects a deposit below this. Decimal USDC. */
		depositUsdc: number;
		/**
		 * Rough floor for a workable position, decimal USDC.
		 *
		 * Not a venue rule — the per-market `minPositionUsdc` is — but the deposit
		 * minimum plus enough margin that a 1x short of it is above the smallest
		 * order any market accepts. Below this a user can deposit successfully and
		 * still find nothing on the board enterable, which is a worse experience
		 * than being told the number up front.
		 */
		positionUsdc: number;
	};
}

/**
 * A margin floor that is honest about being a heuristic.
 *
 * Pacifica's real constraint is per-market (`minPositionUsdc` on each perp leg,
 * which the board already carries), so this is only the figure to show before a
 * market has been chosen. Kept deliberately above the bare deposit minimum: ten
 * dollars of margin clears the deposit and then fails the order minimum on most
 * markets, and discovering that after bridging is the exact failure this exists
 * to prevent.
 */
const WORKABLE_MARGIN_USDC = 25;

export async function getUserBalances(wallet: UserWalletSummary): Promise<UserBalances> {
	const connection = new Connection(config.solanaRpcUrl, "confirmed");

	const [idleUsdc, account] = await Promise.all([
		readIdleUsdc(connection, wallet.tokenAccount),
		readPacificaAccount(wallet.solanaAddress),
	]);

	return {
		solana: {
			address: wallet.solanaAddress,
			idleUsdc: idleUsdc.amount,
			tokenAccountReady: idleUsdc.exists,
		},
		pacifica: account,
		minimums: {
			depositUsdc: MINIMUM_DEPOSIT_USDC,
			positionUsdc: WORKABLE_MARGIN_USDC,
		},
	};
}

/**
 * USDC in the derived wallet, and whether its token account exists at all.
 *
 * The two are reported separately because they are different problems with
 * different fixes. A missing account means the first deposit still has a
 * one-off rent cost ahead of it; an existing account holding zero means the
 * money has not arrived yet. Both read as "0 USDC" and only one of them is
 * worth telling the user about before they bridge.
 */
async function readIdleUsdc(
	connection: Connection,
	tokenAccount: string,
): Promise<{ amount: string; exists: boolean }> {
	try {
		const balance = await connection.getTokenAccountBalance(new PublicKey(tokenAccount));
		return { amount: balance.value.amount, exists: true };
	} catch {
		// `getTokenAccountBalance` throws rather than returning zero for an account
		// that does not exist, and that is the ordinary case for a wallet nobody
		// has bridged to yet — not an error worth propagating.
		return { amount: "0", exists: false };
	}
}

/**
 * The user's Pacifica account, or an honest "does not exist yet".
 *
 * Pacifica has no registration call: an account comes into being on its first
 * deposit. So "not found" is the normal state of a brand-new wallet and has to
 * be distinguished from the venue being down — the former is a step the user
 * has not taken, the latter is an outage, and rendering them the same way sends
 * someone to support over a deposit they simply have not made.
 */
async function readPacificaAccount(account: string): Promise<UserBalances["pacifica"]> {
	try {
		const info = await clients.pacifica.accountInfo(account);
		return {
			account,
			registered: true,
			equityUsdc: toUsdcString(info.account_equity),
			availableUsdc: toUsdcString(info.available_to_spend),
			usedUsdc: toUsdcString(info.total_margin_used),
		};
	} catch (error) {
		if (isAccountNotFound(error)) {
			return {
				account,
				registered: false,
				equityUsdc: null,
				availableUsdc: null,
				usedUsdc: null,
			};
		}
		throw error;
	}
}

/**
 * Pacifica quotes account figures as decimal strings; the app stores 6dp base
 * units. Converted here rather than at the edge so a rounding choice is made
 * once, and rounded rather than truncated — a hundredth of a cent lost on every
 * read accumulates into a balance that never quite matches the venue's.
 */
function toUsdcString(value: string | number | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const parsed = typeof value === "number" ? value : Number.parseFloat(value);
	if (!Number.isFinite(parsed)) return null;
	return String(BigInt(Math.round(parsed * 1e6)));
}

/**
 * Note what a live read established, so the next page load need not re-derive it.
 *
 * Only ever moves a null to a timestamp. A token account cannot un-exist and a
 * builder approval is not revoked by this app, so there is no path that should
 * clear either field — and a reconciliation that could would make an
 * intermittent RPC failure look like a user un-onboarding themselves.
 */
export async function recordOnboardingProgress(params: {
	userId: string;
	tokenAccountReady?: boolean;
	builderCodeApproved?: boolean;
}): Promise<void> {
	const data: { tokenAccountReadyAt?: Date; builderCodeApprovedAt?: Date } = {};
	if (params.tokenAccountReady) data.tokenAccountReadyAt = new Date();
	if (params.builderCodeApproved) data.builderCodeApprovedAt = new Date();
	if (Object.keys(data).length === 0) return;

	await prisma.userWallet.updateMany({
		where: {
			userId: params.userId,
			...(data.tokenAccountReadyAt ? { tokenAccountReadyAt: null } : {}),
			...(data.builderCodeApprovedAt ? { builderCodeApprovedAt: null } : {}),
		},
		data,
	});
}

/** Rent and fees for a first deposit, so the UI can say what it will cost. */
export async function solanaOnboardingCosts() {
	const connection = new Connection(config.solanaRpcUrl, "confirmed");
	const costs = await readSolanaCosts(connection);
	return {
		tokenAccountRentLamports: costs.tokenAccountRent.toString(),
		depositFeeLamports: costs.depositFee.toString(),
		/** Whether this deployment has a fee payer at all. Without one, nobody can deposit. */
		feePayerConfigured: Boolean(config.solanaFeePayerSecret),
	};
}
