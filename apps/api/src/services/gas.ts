import { chainInfo, DEFAULT_CHAIN_ID, requireChainInfo } from "@lemon/core";
import { formatEther } from "viem";
import { clientFor } from "../chain";
import { config } from "../config";
import { getLivePosition } from "./position";

/**
 * Gas in the agents' wallets, and whether an operator needs to top one up.
 *
 * This is the one running cost the protocol cannot pay for itself. An agent's
 * wallets are derived through NEAR chain signatures and hold the position, but
 * they are ordinary accounts on their chains: the EVM one needs that chain's
 * native token to send a transaction — ETH on Base and Arbitrum, **OKB on X
 * Layer** — and the Solana one needs SOL to send an instruction. The vault
 * contract cannot fund either — it holds USDC and may only ever send USDC to one
 * address — so keeping them topped up is an operator's job.
 *
 * The agent's EVM address is the *same* on every chain, because the derivation
 * is chain-agnostic. That is convenient and it is also the trap: a wallet funded
 * on Base shows a healthy balance at an address whose Arbitrum balance is zero.
 * So every balance below is read through that chain's own client.
 *
 * Getting this wrong is quiet and expensive. An agent out of gas does not crash;
 * it fails every write, stops reporting NAV, and the vault goes stale — which
 * blocks deposits and withdrawals on-chain. That reads like a bug in the agent
 * rather than an empty wallet, so the dashboard surfaces the balance directly.
 */

export interface GasBalance {
	/**
	 * "EVM" for the vault's own chain, "SOLANA" for the perp venue's.
	 *
	 * Was `"BASE" | "SOLANA"`, which stopped being a chain name the moment a
	 * vault could custody somewhere else. `chainId` and `chainName` say which
	 * EVM chain; this only says which of the agent's two wallets it is.
	 */
	chain: "EVM" | "SOLANA";
	/** The EVM chain this balance is on. Null for the Solana row. */
	chainId: number | null;
	/** As a person would say it — "Base", "Arbitrum One", "X Layer", "Solana". */
	chainName: string;
	address: string | null;
	/** Raw balance in the chain's smallest unit, as a string. */
	balance: string | null;
	/** Human-readable, in the chain's native unit. */
	formatted: string | null;
	/**
	 * The native token this chain charges gas in.
	 *
	 * Not always ETH. X Layer charges in OKB, so an operator reading "0.001 ETH"
	 * against an X Layer agent would go looking for the wrong asset to send —
	 * and the threshold beside it would be quoted in a unit the chain does not
	 * use.
	 */
	symbol: "ETH" | "OKB" | "SOL";
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
		readEvmGas(position.wallets.evm, position.chainId),
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

async function readEvmGas(address: string, chainId: number): Promise<GasBalance> {
	const info = chainInfo(chainId) ?? requireChainInfo(DEFAULT_CHAIN_ID);

	const shape: GasBalance = {
		chain: "EVM",
		chainId: info.id,
		chainName: info.name,
		address,
		balance: null,
		formatted: null,
		symbol: info.nativeSymbol,
		lowThreshold: formatEther(LOW_ETH_WEI),
		isLow: false,
		estimatedTransactions: null,
		note: null,
	};

	try {
		// This chain's client, not the shared Base one. The address is identical
		// across chains, so the wrong client returns a real balance from the wrong
		// place and an empty wallet reads as funded.
		const balance = await clientFor(info.id).getBalance({ address: address as `0x${string}` });

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
		return { ...shape, note: `${info.name} balance could not be read: ${message(error)}` };
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
		chainId: null,
		chainName: "Solana",
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
