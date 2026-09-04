import { createPublicClient, formatEther, http } from "viem";
import { config } from "../config";
import { getLivePosition } from "./position";

/**
 * Gas in the agents' wallets, and whether an operator needs to top one up.
 *
 * This is the one running cost the protocol cannot pay for itself. An agent's
 * wallets are derived through NEAR chain signatures and hold the position, but
 * they are ordinary accounts on their chains: the EVM one needs ETH on Base to
 * send a transaction, and the Solana one needs SOL to send an instruction. The
 * vault contract cannot fund either — it holds USDC and may only ever send USDC
 * to one address — so keeping them topped up is an operator's job.
 *
 * Getting this wrong is quiet and expensive. An agent out of gas does not crash;
 * it fails every write, stops reporting NAV, and the vault goes stale — which
 * blocks deposits and withdrawals on-chain. That reads like a bug in the agent
 * rather than an empty wallet, so the dashboard surfaces the balance directly.
 */

export interface GasBalance {
	chain: "BASE" | "SOLANA";
	address: string | null;
	/** Raw balance in the chain's smallest unit, as a string. */
	balance: string | null;
	/** Human-readable, in the chain's native unit. */
	formatted: string | null;
	symbol: "ETH" | "SOL";
	/** Below this, the operator should top up. */
	lowThreshold: string;
	isLow: boolean;
	/** Rough number of transactions the balance still covers. */
	estimatedTransactions: number | null;
	note: string | null;
}

export interface VaultGas {
	vault: string;
	ticker: string | null;
	base: GasBalance;
	solana: GasBalance;
	/** True when either chain is below its threshold. */
	needsTopUp: boolean;
}

/**
 * Thresholds, in native units.
 *
 * Base transactions are cents; the ETH figure is generous because the failure it
 * prevents — a vault frozen because nobody noticed an empty wallet — costs far
 * more than the float. Solana rent plus fees is smaller still, but an agent's
 * first USDC token account has a one-off rent cost that dwarfs its per-signature
 * fee, so the SOL floor accounts for that rather than for fees alone.
 */
const LOW_ETH_WEI = 2_000_000_000_000_000n; // 0.002 ETH
const LOW_SOL_LAMPORTS = 20_000_000n; // 0.02 SOL

/** Rough Base cost of one agent write, for the "transactions left" estimate. */
const EST_BASE_TX_WEI = 20_000_000_000_000n; // 0.00002 ETH
const EST_SOLANA_TX_LAMPORTS = 5_000n;

export async function getVaultGas(vaultAddress: string): Promise<VaultGas | null> {
	const position = await getLivePosition(vaultAddress);
	if (!position) return null;

	const [base, solana] = await Promise.all([
		readBaseGas(position.wallets.evm),
		readSolanaGas(position.wallets.solana),
	]);

	return {
		vault: position.vault,
		ticker: null,
		base,
		solana,
		needsTopUp: base.isLow || solana.isLow,
	};
}

async function readBaseGas(address: string): Promise<GasBalance> {
	const shape: GasBalance = {
		chain: "BASE",
		address,
		balance: null,
		formatted: null,
		symbol: "ETH",
		lowThreshold: formatEther(LOW_ETH_WEI),
		isLow: false,
		estimatedTransactions: null,
		note: null,
	};

	try {
		const client = createPublicClient({ transport: http(config.baseRpcUrl) });
		const balance = await client.getBalance({ address: address as `0x${string}` });

		return {
			...shape,
			balance: balance.toString(),
			formatted: formatEther(balance),
			isLow: balance < LOW_ETH_WEI,
			estimatedTransactions: Number(balance / EST_BASE_TX_WEI),
		};
	} catch (error) {
		// Unknown, not zero. Reporting an unreachable RPC as an empty wallet
		// would send an operator to fund an account that is already funded.
		return { ...shape, note: `Base balance could not be read: ${message(error)}` };
	}
}

/**
 * SOL balance, over plain JSON-RPC.
 *
 * Deliberately not via `@solana/web3.js`. This is one `getBalance` call, and
 * pulling a megabyte of SDK into the API to make it is a poor trade.
 */
async function readSolanaGas(address: string | null): Promise<GasBalance> {
	const shape: GasBalance = {
		chain: "SOLANA",
		address,
		balance: null,
		formatted: null,
		symbol: "SOL",
		lowThreshold: (Number(LOW_SOL_LAMPORTS) / 1e9).toString(),
		isLow: false,
		estimatedTransactions: null,
		note: null,
	};

	if (!address) {
		return {
			...shape,
			note: "The agent's Solana address is not known to this deployment, so its balance cannot be checked.",
		};
	}

	try {
		const response = await fetch(config.solanaRpcUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "getBalance",
				params: [address],
			}),
			signal: AbortSignal.timeout(8_000),
		});

		const body = (await response.json()) as {
			result?: { value?: number };
			error?: { message?: string };
		};
		if (body.error) throw new Error(body.error.message ?? "Solana RPC error");

		const lamports = BigInt(body.result?.value ?? 0);
		return {
			...shape,
			balance: lamports.toString(),
			formatted: (Number(lamports) / 1e9).toFixed(6),
			isLow: lamports < LOW_SOL_LAMPORTS,
			estimatedTransactions: Number(lamports / EST_SOLANA_TX_LAMPORTS),
		};
	} catch (error) {
		return { ...shape, note: `Solana balance could not be read: ${message(error)}` };
	}
}

/** Every vault's gas at once, for the dashboard's top-up view. */
export async function getAllVaultGas(
	vaults: { address: string; ticker: string | null }[],
): Promise<VaultGas[]> {
	const results = await Promise.all(
		vaults.map(async (v) => {
			const gas = await getVaultGas(v.address).catch(() => null);
			return gas ? { ...gas, ticker: v.ticker } : null;
		}),
	);
	return results.filter((g): g is VaultGas => g !== null);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
