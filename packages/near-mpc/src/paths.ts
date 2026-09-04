/**
 * Derivation paths.
 *
 * A path is permanent: it is the only link between a connected wallet and the
 * addresses that hold its funds. Changing the format — even its casing —
 * silently points existing users at fresh, empty wallets while their balances
 * stay behind at addresses nothing derives any more. Hence the explicit version
 * prefix: a future scheme gets `lemon-v2` and an explicit migration, never a
 * quiet edit to this function.
 */
export const DERIVATION_PATH_VERSION = "lemon-v1";

/**
 * The path a connected wallet's derived accounts live under.
 *
 * Addresses are lowercased because EIP-55 checksum casing varies by wallet and
 * by call site, and two spellings of one address must not become two accounts.
 */
export function derivationPath(connectedAddress: string): string {
	const normalised = connectedAddress.trim().toLowerCase();
	if (!/^0x[0-9a-f]{40}$/.test(normalised)) {
		throw new Error(`Not an EVM address, so not a usable derivation path: ${connectedAddress}`);
	}
	return `${DERIVATION_PATH_VERSION}/${normalised}`;
}

/**
 * Derivation path version for vault agents.
 *
 * Separate from the user path prefix on purpose: the two namespaces must never
 * be able to collide. A vault address and a wallet address are both 20 bytes, so
 * sharing a prefix would mean a vault whose address happened to equal a user's
 * wallet derived that user's keys — astronomically unlikely, and a category of
 * bug that costs nothing to make impossible instead.
 */
export const VAULT_DERIVATION_PATH_VERSION = "lemon-vault-v1";

/**
 * The path a vault's agent wallet lives under.
 *
 * Derived from the vault address, so the agent's EVM and Solana addresses are a
 * pure function of the vault they serve. Nothing is stored: lose the database
 * and the agent's wallets are still recoverable from the vault address alone,
 * which matters because those wallets hold the deployed position.
 *
 * There is a bootstrap order here worth naming. The vault bakes in
 * `agentWallet` at construction and cannot change it, so the address has to be
 * derived *before* the vault exists — which means deriving from the vault
 * address is impossible. The admin flow therefore derives from a market
 * identifier instead; see `agentDerivationPath`.
 */
export function vaultAgentDerivationPath(vaultAddress: string): string {
	const normalised = vaultAddress.trim().toLowerCase();
	if (!/^0x[0-9a-f]{40}$/.test(normalised)) {
		throw new Error(`Not an EVM address, so not a usable vault path: ${vaultAddress}`);
	}
	return `${VAULT_DERIVATION_PATH_VERSION}/${normalised}`;
}

/**
 * The path an agent wallet is derived from before its vault exists.
 *
 * A vault's `agentWallet` is immutable and set in the constructor, so the
 * address must be known first — which rules out deriving it from the vault
 * address. The market identifier is the one stable name available at that point,
 * and it is also the thing the vault is one-to-one with, so the mapping stays
 * unique: one market, one path, one agent, one vault.
 *
 * @param marketId The market's ticker, e.g. "NVDA". Lowercased for the same
 *        reason wallet addresses are — two spellings must not become two agents.
 * @param tier "conservative" or "leveraged". Included because the two tiers are
 *        separate vaults on the same market, and they must not share an agent:
 *        one key controlling both books would make a single compromise two
 *        losses, which is exactly what the factory's one-agent-per-vault rule
 *        exists to prevent.
 */
export function agentDerivationPath(marketId: string, tier: "conservative" | "leveraged"): string {
	const normalised = marketId.trim().toLowerCase();
	if (!/^[a-z0-9._-]{1,32}$/.test(normalised)) {
		throw new Error(`Not a usable market id for a derivation path: ${marketId}`);
	}
	return `${VAULT_DERIVATION_PATH_VERSION}/${tier}/${normalised}`;
}
