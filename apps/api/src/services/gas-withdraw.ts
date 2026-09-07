import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
	createPublicClient,
	formatEther,
	http,
	keccak256,
	parseEther,
	serializeTransaction,
	toBytes,
} from "viem";
import { base } from "viem/chains";
import { clients, config } from "../config";
import { AdminError } from "./admin";
import { getVault } from "./vaults";

/**
 * Taking gas back out of an agent's wallets.
 *
 * The counterpart to topping them up, and it exists for one situation in
 * particular: contracts get redeployed. A vault is immutable, so a new version
 * of the protocol is a new set of vaults with new agents — and the ETH and SOL
 * an operator put into the old agents to keep them writing is stranded there.
 * It is not protocol capital and never was: it came out of an operator's own
 * wallet, so it should be able to go back.
 *
 * Nothing here can touch the position. These wallets hold USDC, a spot token
 * and a Pacifica account as well as gas, and this moves only the chain's native
 * unit — ETH on Base, SOL on Solana. There is deliberately no path from this
 * code to an ERC-20 transfer or a Pacifica withdrawal, because the vault's own
 * `agentReturn` is the only way depositor funds are meant to move and a second
 * one would be a second thing to get right.
 *
 * The signing is the same MPC round trip the agent uses. No private key exists
 * for these wallets, which is what makes them recoverable — and it also means
 * an operator cannot sweep them by importing a seed phrase somewhere. This
 * route is the only way, so it has to exist for the funds to be reachable at
 * all.
 */

export interface GasWithdrawal {
	chain: "BASE" | "SOLANA";
	vault: string;
	from: string;
	to: string;
	/** What was actually sent, in the chain's smallest unit. */
	amount: string;
	/** The same, in the chain's native unit. */
	formatted: string;
	symbol: "ETH" | "SOL";
	/** Held back to pay for this transaction, in the smallest unit. */
	feeReserved: string;
	/** Left behind afterwards. Zero for a sweep, give or take the fee refund. */
	remaining: string;
	hash: string;
	explorerUrl: string;
}

/** What a wallet could send right now, once its own transaction is paid for. */
export interface GasWithdrawable {
	chain: "BASE" | "SOLANA";
	address: string;
	balance: string;
	/** Balance minus the fee this transfer would cost. Never negative. */
	spendable: string;
	formattedSpendable: string;
	symbol: "ETH" | "SOL";
	/** Set when the wallet holds something but cannot cover its own transfer. */
	note: string | null;
}

/**
 * A Solana account below the rent-exempt minimum is deleted by the runtime.
 *
 * Which is fine for a sweep — the address is derived, so sending to it again
 * recreates it — but not for a partial withdrawal, where it would silently
 * take the remainder as well. Read from the cluster rather than hardcoded,
 * because it is a function of the rent parameters rather than a constant.
 */
async function rentExemptMinimum(connection: Connection): Promise<bigint> {
	return BigInt(await connection.getMinimumBalanceForRentExemption(0));
}

/** Gas for a plain native transfer to an EOA. Estimated when the target is not one. */
const ETH_TRANSFER_GAS = 21_000n;

/**
 * The vault's agent, checked against the chain before anything is signed.
 *
 * The derivation path is the only thing that decides which wallet gets swept,
 * and a wrong one names a real, valid, entirely unrelated wallet rather than
 * failing. So the path's EVM address is compared with the agent address the
 * vault itself names on-chain — the one piece of this that no database row can
 * be wrong about.
 */
async function resolveAgent(vaultAddress: string) {
	if (!clients.nearMpc) {
		throw new AdminError(
			"NEAR chain signatures are not configured on this deployment, so it cannot sign for an agent wallet. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY.",
			503,
		);
	}

	const vault = await getVault(vaultAddress);
	if (!vault) throw new AdminError(`No vault at ${vaultAddress}`, 404);

	if (vault.agentEnabled) {
		// Draining a working agent is how a vault goes stale, and a stale NAV
		// blocks deposits and withdrawals on-chain. Turning the agent off first
		// is one click on the same dashboard, so this refuses rather than warns.
		throw new AdminError(
			`The agent for ${vault.ticker ?? vaultAddress} is still running. Taking its gas would stop it reporting, which blocks deposits and withdrawals on-chain — turn the agent off first.`,
			409,
		);
	}

	if (!vault.agentPath) {
		throw new AdminError(
			`No derivation path is recorded for ${vaultAddress}, so its agent wallets cannot be signed for. Nothing is lost — the path is a function of the ticker and tier — but it has to be restored in the database first.`,
			409,
		);
	}

	const derived = clients.nearMpc.derive(vault.agentPath);
	if (derived.evmAddress.toLowerCase() !== vault.agentWallet.toLowerCase()) {
		throw new AdminError(
			`Path "${vault.agentPath}" derives ${derived.evmAddress}, but ${vaultAddress} names ${vault.agentWallet} as its agent. These are different wallets, so nothing has been signed.`,
			409,
		);
	}

	return {
		vault,
		path: vault.agentPath,
		// `VaultView` types the agent as a plain string; the chain and the
		// derivation check above both agree it is an address.
		evm: vault.agentWallet as `0x${string}`,
		solana: derived.solanaAddress,
	};
}

/* -------------------------------------------------------------------- Base */

function baseClient() {
	return createPublicClient({ chain: base, transport: http(config.baseRpcUrl) });
}

/**
 * The fee a sweep has to leave behind.
 *
 * `maxFeePerGas` rather than the current base fee, because that is what the
 * chain reserves when the transaction is admitted — reserving only the likely
 * cost produces a transaction that cannot be included at all. The difference
 * comes back as dust in the wallet, which is a better outcome than a sweep that
 * fails on every attempt.
 */
async function baseTransferCost(
	client: ReturnType<typeof baseClient>,
	from: `0x${string}`,
	to: `0x${string}`,
): Promise<{ gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cost: bigint }> {
	const fees = await client.estimateFeesPerGas();
	const maxFeePerGas = fees.maxFeePerGas;
	const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;

	// Estimated with a nominal value: a destination that is a contract with a
	// payable fallback costs more than 21000, and estimating with the full
	// balance would fail for want of the fee on top of it.
	const gas = await client
		.estimateGas({ account: from, to, value: 1n })
		.catch(() => ETH_TRANSFER_GAS);

	return { gas, maxFeePerGas, maxPriorityFeePerGas, cost: gas * maxFeePerGas };
}

async function withdrawBaseGas(params: {
	vault: string;
	path: string;
	from: `0x${string}`;
	to: `0x${string}`;
	/** Omit to sweep everything the wallet can spare. */
	amountWei?: bigint;
}): Promise<GasWithdrawal> {
	const mpc = clients.nearMpc;
	if (!mpc) throw new AdminError("NEAR chain signatures are not configured.", 503);

	const client = baseClient();
	const [balance, nonce, fee] = await Promise.all([
		client.getBalance({ address: params.from }),
		// Pending, not latest. Nothing should be in flight from a stopped agent,
		// but a nonce taken from the mined tip while one is would collide and
		// replace it — and this route runs at the moment an operator is trying to
		// tidy up, which is exactly when a stuck transaction is likely.
		client.getTransactionCount({ address: params.from, blockTag: "pending" }),
		baseTransferCost(client, params.from, params.to),
	]);

	const spendable = balance > fee.cost ? balance - fee.cost : 0n;
	const value = params.amountWei ?? spendable;

	if (value <= 0n) {
		throw new AdminError(
			balance === 0n
				? `${params.from} holds no ETH on Base.`
				: `${params.from} holds ${formatEther(balance)} ETH, which does not cover the ${formatEther(fee.cost)} ETH this transfer would cost. There is nothing to recover.`,
			409,
		);
	}
	if (value > spendable) {
		throw new AdminError(
			`${formatEther(value)} ETH is more than the ${formatEther(spendable)} ETH available once the ${formatEther(fee.cost)} ETH fee is covered.`,
			400,
		);
	}

	const transaction = {
		type: "eip1559",
		chainId: base.id,
		to: params.to,
		value,
		gas: fee.gas,
		maxFeePerGas: fee.maxFeePerGas,
		maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
		nonce,
	} as const;

	// ECDSA signs a digest, so the transaction is serialised unsigned, hashed,
	// and then re-serialised with the signature attached.
	const unsigned = serializeTransaction(transaction);
	const signature = await mpc.signSecp256k1(params.path, toBytes(keccak256(unsigned)));
	const signed = serializeTransaction(transaction, {
		r: signature.r,
		s: signature.s,
		v: BigInt(signature.v),
		yParity: signature.yParity,
	});

	const hash = await client.sendRawTransaction({ serializedTransaction: signed });

	return {
		chain: "BASE",
		vault: params.vault,
		from: params.from,
		to: params.to,
		amount: value.toString(),
		formatted: formatEther(value),
		symbol: "ETH",
		feeReserved: fee.cost.toString(),
		remaining: (balance - value - fee.cost).toString(),
		hash,
		explorerUrl: `https://basescan.org/tx/${hash}`,
	};
}

/* ------------------------------------------------------------------ Solana */

/** Lamports per SOL, and the only place the conversion is written. */
const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatSol(lamports: bigint): string {
	return (Number(lamports) / Number(LAMPORTS_PER_SOL))
		.toFixed(9)
		.replace(/0+$/, "")
		.replace(/\.$/, "");
}

export function parseSol(amount: string): bigint {
	const trimmed = amount.trim();
	if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
		throw new AdminError(`"${amount}" is not an amount of SOL.`, 400);
	}
	const [whole, fraction = ""] = trimmed.split(".");
	return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fraction.padEnd(9, "0"));
}

/**
 * A SOL transfer signed by the agent's own Ed25519 key, paid for by itself.
 *
 * Unlike everything else the agent does on Solana, this does not need the
 * shared fee payer: the whole point is that this wallet holds SOL, so it can
 * cover its own signature. That also keeps the operator's fee-payer keypair out
 * of a route that exists to move an operator's money.
 */
async function withdrawSolanaGas(params: {
	vault: string;
	path: string;
	from: string;
	to: string;
	amountLamports?: bigint;
}): Promise<GasWithdrawal> {
	const mpc = clients.nearMpc;
	if (!mpc) throw new AdminError("NEAR chain signatures are not configured.", 503);

	let destination: PublicKey;
	try {
		destination = new PublicKey(params.to);
	} catch {
		throw new AdminError(`"${params.to}" is not a Solana address.`, 400);
	}

	const connection = new Connection(config.solanaRpcUrl, "confirmed");
	const from = new PublicKey(params.from);

	const [balanceRaw, rentMinimum, { blockhash, lastValidBlockHeight }] = await Promise.all([
		connection.getBalance(from, "confirmed"),
		rentExemptMinimum(connection),
		connection.getLatestBlockhash("confirmed"),
	]);
	const balance = BigInt(balanceRaw);

	// The fee depends on the message, and the message depends on the amount —
	// so it is priced against a nominal transfer first. Signature count and
	// account set are identical either way, which is all the fee is a function of.
	const probe = solTransfer({ from, to: destination, lamports: 1n, blockhash });
	const feeResponse = await connection.getFeeForMessage(probe.compileMessage(), "confirmed");
	const fee = BigInt(feeResponse.value ?? 5_000);

	const spendable = balance > fee ? balance - fee : 0n;
	const lamports = params.amountLamports ?? spendable;

	if (lamports <= 0n) {
		throw new AdminError(
			balance === 0n
				? `${params.from} holds no SOL.`
				: `${params.from} holds ${formatSol(balance)} SOL, which does not cover the ${formatSol(fee)} SOL fee for moving it.`,
			409,
		);
	}
	if (lamports > spendable) {
		throw new AdminError(
			`${formatSol(lamports)} SOL is more than the ${formatSol(spendable)} SOL available once the ${formatSol(fee)} SOL fee is covered.`,
			400,
		);
	}

	// Solana deletes an account left below the rent-exempt minimum, taking the
	// remainder with it. Emptying it completely is fine — the address is derived
	// and comes back the moment anything is sent to it — but stranding a few
	// thousand lamports is not, so a partial withdrawal has to leave either
	// nothing or enough.
	const remaining = balance - lamports - fee;
	if (remaining > 0n && remaining < rentMinimum) {
		throw new AdminError(
			`That would leave ${formatSol(remaining)} SOL behind, below the ${formatSol(rentMinimum)} SOL rent-exempt minimum — Solana would delete the account and the remainder with it. Withdraw everything, or leave at least that much.`,
			400,
		);
	}

	const transaction = solTransfer({ from, to: destination, lamports, blockhash });

	// Ed25519 covers the compiled message verbatim rather than a digest of it,
	// so these are the exact bytes the runtime verifies against.
	const signature = await mpc.signSolanaMessage(
		params.path,
		Uint8Array.from(transaction.serializeMessage()),
	);
	transaction.addSignature(from, Buffer.from(signature));

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
			`Solana rejected the transfer: ${JSON.stringify(confirmation.value.err)} (${hash})`,
			502,
		);
	}

	return {
		chain: "SOLANA",
		vault: params.vault,
		from: params.from,
		to: params.to,
		amount: lamports.toString(),
		formatted: formatSol(lamports),
		symbol: "SOL",
		feeReserved: fee.toString(),
		remaining: remaining.toString(),
		hash,
		explorerUrl: `https://solscan.io/tx/${hash}`,
	};
}

function solTransfer(params: {
	from: PublicKey;
	to: PublicKey;
	lamports: bigint;
	blockhash: string;
}): Transaction {
	const transaction = new Transaction();
	transaction.feePayer = params.from;
	transaction.recentBlockhash = params.blockhash;
	transaction.add(
		SystemProgram.transfer({
			fromPubkey: params.from,
			toPubkey: params.to,
			lamports: params.lamports,
		}),
	);
	return transaction;
}

/* --------------------------------------------------------------- the entry */

/**
 * What each of a vault agent's wallets could send right now.
 *
 * Read before offering the button, because "sweep everything" has to mean a
 * number the operator saw. The figures are net of the fee the transfer itself
 * costs, which is why they do not match the balances on the gas panel.
 */
export async function withdrawableGas(vaultAddress: string): Promise<{
	vault: string;
	agentEnabled: boolean;
	base: GasWithdrawable;
	solana: GasWithdrawable;
}> {
	const agent = await resolveAgent(vaultAddress);

	const [baseSide, solanaSide] = await Promise.all([
		(async (): Promise<GasWithdrawable> => {
			const client = baseClient();
			const balance = await client.getBalance({ address: agent.evm });
			// Priced against the agent's own address: a self-transfer costs the
			// same 21000 gas as a transfer to any other EOA, and the destination
			// is not known yet.
			const fee = await baseTransferCost(client, agent.evm, agent.evm);
			const spendable = balance > fee.cost ? balance - fee.cost : 0n;
			return {
				chain: "BASE",
				address: agent.evm,
				balance: balance.toString(),
				spendable: spendable.toString(),
				formattedSpendable: formatEther(spendable),
				symbol: "ETH",
				note:
					balance > 0n && spendable === 0n
						? `The balance is below the ${formatEther(fee.cost)} ETH it would cost to move it.`
						: null,
			};
		})(),

		(async (): Promise<GasWithdrawable> => {
			const connection = new Connection(config.solanaRpcUrl, "confirmed");
			const balance = BigInt(await connection.getBalance(new PublicKey(agent.solana), "confirmed"));
			const fee = 5_000n;
			const spendable = balance > fee ? balance - fee : 0n;
			return {
				chain: "SOLANA",
				address: agent.solana,
				balance: balance.toString(),
				spendable: spendable.toString(),
				formattedSpendable: formatSol(spendable),
				symbol: "SOL",
				note:
					balance > 0n && spendable === 0n
						? `The balance is below the ${formatSol(fee)} SOL it would cost to move it.`
						: null,
			};
		})(),
	]);

	return {
		vault: agent.vault.address,
		agentEnabled: agent.vault.agentEnabled,
		base: baseSide,
		solana: solanaSide,
	};
}

/**
 * Send an agent's gas somewhere else.
 *
 * `amount` is in the chain's native unit — ETH or SOL, not wei or lamports —
 * because that is what the operator typed. Omitting it sweeps whatever the
 * wallet can spare after paying for the transfer.
 */
export async function withdrawGas(params: {
	vault: string;
	chain: "BASE" | "SOLANA";
	to: string;
	amount?: string;
}): Promise<GasWithdrawal> {
	const agent = await resolveAgent(params.vault);

	if (params.chain === "BASE") {
		if (!/^0x[a-fA-F0-9]{40}$/.test(params.to.trim())) {
			throw new AdminError(`"${params.to}" is not an EVM address.`, 400);
		}
		return withdrawBaseGas({
			vault: agent.vault.address,
			path: agent.path,
			from: agent.evm,
			to: params.to.trim() as `0x${string}`,
			amountWei: params.amount ? safeParseEther(params.amount) : undefined,
		});
	}

	return withdrawSolanaGas({
		vault: agent.vault.address,
		path: agent.path,
		from: agent.solana,
		to: params.to.trim(),
		amountLamports: params.amount ? parseSol(params.amount) : undefined,
	});
}

/** `parseEther` throws a viem error; an operator's typo deserves a plainer one. */
function safeParseEther(amount: string): bigint {
	const trimmed = amount.trim();
	if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) {
		throw new AdminError(`"${amount}" is not an amount of ETH.`, 400);
	}
	return parseEther(trimmed as `${number}`);
}
