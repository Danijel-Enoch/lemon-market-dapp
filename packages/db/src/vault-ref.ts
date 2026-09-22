import { DEFAULT_CHAIN_ID } from "@lemon/core";
import { prisma } from "./client";

/**
 * How a vault is named once there is more than one chain.
 *
 * An address alone stopped being an identifier. Vault addresses are
 * `CREATE`-derived from the factory's address and nonce, and the factories are
 * themselves deployed from one deployer at matching nonces — so the same address
 * appearing on two chains is the expected case rather than a coincidence to
 * guard against. Every row that names a vault therefore names its chain too, and
 * this is the pair that does it.
 */
export interface VaultRef {
	chainId: number;
	/** Lowercased. Two spellings of one address must not become two vaults. */
	address: string;
}

export function vaultRef(chainId: number, address: string): VaultRef {
	return { chainId, address: address.trim().toLowerCase() };
}

/** Prisma's composite-key shape for `VaultConfig`, from a ref. */
export function vaultWhere(ref: VaultRef) {
	return { chainId_address: { chainId: ref.chainId, address: ref.address } };
}

/** Prisma's composite-key shape for one of a vault's markets. */
export function vaultMarketWhere(ref: VaultRef, ticker: string) {
	return {
		chainId_vaultAddress_ticker: {
			chainId: ref.chainId,
			vaultAddress: ref.address,
			ticker,
		},
	};
}

export type ResolveResult =
	| { ok: true; ref: VaultRef }
	| { ok: false; reason: "unknown" | "ambiguous"; message: string; chains: number[] };

/**
 * Which chain a bare vault address refers to.
 *
 * For the call sites that genuinely only have an address — a URL a user saved, a
 * CLI argument, an operator pasting something into the admin console. It looks
 * the address up rather than assuming, and refuses rather than choosing when the
 * answer is not unique.
 *
 * Refusing matters more than it sounds. Defaulting an ambiguous address to Base
 * would not produce an error anywhere: the query succeeds, a real vault comes
 * back, and every number on the page is a correct number about the wrong vault.
 * There is no downstream check that would catch it, because nothing downstream
 * has any reason to doubt the row it was handed.
 */
export async function resolveVaultRef(address: string): Promise<ResolveResult> {
	const lower = address.trim().toLowerCase();

	const matches = await prisma.vaultConfig.findMany({
		where: { address: lower },
		select: { chainId: true },
	});

	if (matches.length === 0) {
		return {
			ok: false,
			reason: "unknown",
			message: `No vault is configured at ${lower} on any chain.`,
			chains: [],
		};
	}
	if (matches.length === 1) {
		return { ok: true, ref: { chainId: matches[0].chainId, address: lower } };
	}

	const chains = matches.map((m) => m.chainId);
	return {
		ok: false,
		reason: "ambiguous",
		message: `${lower} is a vault on more than one chain (${chains.join(", ")}). Say which chain you mean.`,
		chains,
	};
}

/**
 * A ref from an address and an optional chain id.
 *
 * The shape most request handlers want: use the chain if the caller supplied
 * one, and resolve it if they did not. `DEFAULT_CHAIN_ID` is imported here only
 * so callers can be explicit about wanting it — nothing in this file falls back
 * to it silently.
 */
export async function refFrom(address: string, chainId?: number | null): Promise<ResolveResult> {
	if (chainId !== undefined && chainId !== null) {
		return { ok: true, ref: vaultRef(chainId, address) };
	}
	return resolveVaultRef(address);
}

export { DEFAULT_CHAIN_ID };
