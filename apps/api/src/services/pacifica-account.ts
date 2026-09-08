import {
	associatedTokenAddress,
	createUsdcAccountIfMissing,
	lamportsRequired,
	MINIMUM_DEPOSIT_USDC,
	readSolanaCosts,
	USDC_MINT,
} from "@lemon/pacifica/deposit";
import { base58 } from "@scure/base";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { clients, config } from "../config";
import { AdminError } from "./admin";
import { getVault } from "./vaults";

/**
 * The agent's Pacifica side, set up before it is needed.
 *
 * Pacifica has no "register an account" call: an account comes into existence
 * the first time USDC is deposited to it, keyed by the Solana address that
 * signed the deposit. What *does* have to exist first is that address's USDC
 * token account — an on-chain account with rent to pay, which the agent's own
 * wallet cannot pay for because it holds USDC and never SOL.
 *
 * The bridge already creates it idempotently on the first crossing, so this is
 * not load-bearing. It is worth having anyway, for two reasons. The first
 * crossing happens with a depositor's capital already drawn out of the vault
 * and mid-flight between two chains, which is the worst moment to discover that
 * the fee payer is empty or misconfigured — this moves that discovery to vault
 * creation, where the fix costs nothing. And it gives an operator a way to see
 * that a freshly derived wallet is real on Solana rather than inferring it from
 * an address that has never appeared on chain.
 */

export interface PacificaAccountStatus {
	vault: string;
	/** The agent's Solana address, which *is* its Pacifica account id. */
	account: string;
	/** The USDC token account it deposits from. */
	tokenAccount: string;
	/** Whether that token account exists on-chain yet. */
	tokenAccountExists: boolean;
	/** USDC sitting in it, in base units. Zero when the account does not exist. */
	usdcBalance: string;
	/** Set once Pacifica has seen a deposit; null until then. */
	equityUsd: string | null;
	/** True when Pacifica already knows this account. */
	registered: boolean;
	/** Whether an operator could run the setup right now. */
	canSetUp: boolean;
	/** Why not, when they cannot. */
	blockedReason: string | null;
	minimumDepositUsdc: number;
}

export interface PacificaAccountSetup {
	vault: string;
	account: string;
	tokenAccount: string;
	/** Null when the account already existed and nothing was sent. */
	hash: string | null;
	explorerUrl: string | null;
	/** Plain-language account of what happened, for the dashboard to show. */
	summary: string;
}

/**
 * The agent's Solana address, checked against the vault's on-chain agent.
 *
 * Same guard as the gas routes use, and for the same reason: the Solana
 * address is derived rather than on-chain, so the only way to know it belongs
 * to this vault is that its EVM sibling matches the address the vault names.
 */
async function resolveSolanaAgent(
	vaultAddress: string,
): Promise<{ vault: string; solana: string }> {
	if (!clients.nearMpc) {
		throw new AdminError(
			"NEAR chain signatures are not configured on this deployment, so the agent's Solana address cannot be derived. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY.",
			503,
		);
	}

	const vault = await getVault(vaultAddress);
	if (!vault) throw new AdminError(`No vault at ${vaultAddress}`, 404);
	if (!vault.agentPath) {
		throw new AdminError(
			`No derivation path is recorded for ${vaultAddress}, so its Solana wallet cannot be derived.`,
			409,
		);
	}

	const derived = clients.nearMpc.derive(vault.agentPath);
	if (derived.evmAddress.toLowerCase() !== vault.agentWallet.toLowerCase()) {
		throw new AdminError(
			`Path "${vault.agentPath}" derives ${derived.evmAddress}, but ${vaultAddress} names ${vault.agentWallet} as its agent. The Solana address from that path does not belong to this vault.`,
			409,
		);
	}

	return { vault: vault.address, solana: derived.solanaAddress };
}

/**
 * A fee payer secret in either of the two forms an operator will have one in.
 *
 * `solana-keygen` writes a JSON byte array; every browser wallet exports
 * base58. Accepting only one would meet the other with a checksum error rather
 * than a format complaint.
 */
function feePayerKeypair(): Keypair {
	const secret = config.solanaFeePayerSecret?.trim();
	if (!secret) {
		throw new AdminError(
			"SOLANA_FEE_PAYER_SECRET is not set. An agent's Solana wallet holds USDC but never SOL, so a separate keypair has to pay the rent on its token account.",
			503,
		);
	}

	try {
		const bytes = secret.startsWith("[")
			? Uint8Array.from(JSON.parse(secret) as number[])
			: base58.decode(secret);
		return Keypair.fromSecretKey(bytes);
	} catch (error) {
		throw new AdminError(
			`SOLANA_FEE_PAYER_SECRET is not a Solana secret key: expected base58 or a JSON byte array. ${error instanceof Error ? error.message : String(error)}`,
			503,
		);
	}
}

export async function pacificaAccountStatus(vaultAddress: string): Promise<PacificaAccountStatus> {
	const agent = await resolveSolanaAgent(vaultAddress);
	const owner = new PublicKey(agent.solana);
	const tokenAccount = associatedTokenAddress(owner, USDC_MINT);

	const connection = new Connection(config.solanaRpcUrl, "confirmed");

	// Pacifica answers for an account it has never seen with an error rather
	// than zeros, and "not registered yet" is the ordinary state of a new vault
	// — not something to surface as a failure.
	const [balance, account] = await Promise.all([
		connection.getTokenAccountBalance(tokenAccount, "confirmed").catch(() => null),
		clients.pacifica.accountInfo(agent.solana).catch(() => null),
	]);

	const feePayerConfigured = Boolean(config.solanaFeePayerSecret?.trim());

	// What the fee payer can actually afford, not just whether one is set. The
	// button used to be enabled on a configured secret alone, which meant an
	// underfunded fee payer failed at `sendRawTransaction` with a runtime error
	// — at the one moment this whole flow exists to avoid.
	const funding = feePayerConfigured && balance === null ? await feePayerFunding(connection) : null;

	return {
		vault: agent.vault,
		account: agent.solana,
		tokenAccount: tokenAccount.toBase58(),
		tokenAccountExists: balance !== null,
		usdcBalance: balance ? balance.value.amount : "0",
		equityUsd: account?.account_equity ?? null,
		registered: account !== null,
		canSetUp: feePayerConfigured && balance === null && funding?.sufficient === true,
		blockedReason: !feePayerConfigured
			? "SOLANA_FEE_PAYER_SECRET is not set on this deployment, so nothing here can pay the rent on the token account."
			: balance !== null
				? "The token account already exists; there is nothing left to create."
				: (funding?.reason ?? null),
		minimumDepositUsdc: MINIMUM_DEPOSIT_USDC,
	};
}

/**
 * Whether the fee payer holds enough to create one token account.
 *
 * Same arithmetic the agent's bridge preflight runs, from the same shared
 * helpers, so the dashboard and the agent cannot disagree about whether a
 * deployment can pay its own way.
 */
async function feePayerFunding(
	connection: Connection,
): Promise<{ sufficient: boolean; reason: string | null }> {
	const payer = feePayerKeypair();
	const [lamports, costs] = await Promise.all([
		connection.getBalance(payer.publicKey, "confirmed"),
		readSolanaCosts({
			getMinimumBalanceForRentExemption: (bytes) =>
				connection.getMinimumBalanceForRentExemption(bytes, "confirmed"),
		}),
	]);

	const required = lamportsRequired(costs, true);
	if (BigInt(lamports) >= required) return { sufficient: true, reason: null };

	const sol = (value: bigint) => (Number(value) / 1e9).toFixed(6);
	return {
		sufficient: false,
		reason: `The fee payer ${payer.publicKey.toBase58()} holds ${sol(BigInt(lamports))} SOL and creating this token account needs ${sol(required)} — ${sol(required - BigInt(lamports))} short. Most of that is the account's rent (${sol(costs.tokenAccountRent)} SOL), paid once and never again. Send SOL to that address and this will go through.`,
	};
}

/**
 * Create the agent's USDC token account, paid for by the operator's fee payer.
 *
 * Idempotent by construction — the instruction is `CreateIdempotent`, so a
 * second run against an existing account is a no-op rather than a failure — but
 * the existing account is checked first anyway so the operator is told nothing
 * happened instead of paying a fee to be told nothing.
 *
 * Deliberately does not deposit. A Pacifica account is only registered once
 * USDC arrives, and that USDC is depositor capital which moves through the
 * vault and the bridge, under the agent's policy. An admin button that moved it
 * would be a second, unaudited path for the money.
 */
export async function setUpPacificaAccount(vaultAddress: string): Promise<PacificaAccountSetup> {
	const status = await pacificaAccountStatus(vaultAddress);

	if (status.tokenAccountExists) {
		return {
			vault: status.vault,
			account: status.account,
			tokenAccount: status.tokenAccount,
			hash: null,
			explorerUrl: null,
			summary: status.registered
				? "Already set up, and Pacifica has seen this account. Nothing to do."
				: "The USDC account already exists. Pacifica registers the account itself on the first deposit, which the agent makes when the vault has capital to deploy.",
		};
	}

	const payer = feePayerKeypair();
	const owner = new PublicKey(status.account);
	const connection = new Connection(config.solanaRpcUrl, "confirmed");

	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
	const transaction = new Transaction();
	transaction.feePayer = payer.publicKey;
	transaction.recentBlockhash = blockhash;
	transaction.add(createUsdcAccountIfMissing({ payer: payer.publicKey, owner }));
	transaction.sign(payer);

	const hash = await connection.sendRawTransaction(transaction.serialize(), {
		skipPreflight: false,
		maxRetries: 3,
	});
	const confirmation = await connection.confirmTransaction(
		{ signature: hash, blockhash, lastValidBlockHeight },
		"confirmed",
	);
	if (confirmation.value.err) {
		throw new AdminError(
			`Solana rejected the token account creation: ${JSON.stringify(confirmation.value.err)} (${hash})`,
			502,
		);
	}

	return {
		vault: status.vault,
		account: status.account,
		tokenAccount: status.tokenAccount,
		hash,
		explorerUrl: `https://solscan.io/tx/${hash}`,
		summary: `The agent's USDC account exists on Solana. Pacifica registers the account itself on the first deposit of at least ${MINIMUM_DEPOSIT_USDC} USDC, which the agent makes once the vault has capital to deploy.`,
	};
}
