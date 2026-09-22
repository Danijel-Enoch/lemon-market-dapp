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
 * @param chainKey Which chain the vault will be deployed on, from
 *        `@lemon/core`'s registry — "base", "arbitrum" or "xlayer".
 *
 * The chain is **required and has no default**, and that is the entire point of
 * this parameter. Before it existed the path was market plus tier, which was
 * unique only while there was one chain: an NVDA conservative vault on Arbitrum
 * derived byte-for-byte the same path as the NVDA conservative vault on Base,
 * and therefore the same agent key. One key signing for two vaults' books is
 * precisely the failure the tier segment above was added to prevent, arriving
 * by a different door. A default of "base" would have reintroduced it at every
 * call site that had not been updated, silently and without a type error.
 *
 * Base keeps its original two-segment shape rather than gaining a "base"
 * segment. This is a grandfather clause, not an oversight. Those paths are
 * already deployed and already hold positions, so versioning them would not be
 * a rename — it would be a migration that moves real money between wallets for
 * no benefit. The two namespaces provably cannot collide: a legacy path's
 * second segment is always a tier, and no chain key is a tier name.
 */
export function agentDerivationPath(
	marketId: string,
	tier: "conservative" | "leveraged",
	chainKey: string,
): string {
	const normalised = marketId.trim().toLowerCase();
	if (!/^[a-z0-9._-]{1,32}$/.test(normalised)) {
		throw new Error(`Not a usable market id for a derivation path: ${marketId}`);
	}

	const chain = chainKey.trim().toLowerCase();
	if (!/^[a-z0-9-]{1,16}$/.test(chain)) {
		throw new Error(`Not a usable chain key for a derivation path: ${chainKey}`);
	}
	// A chain key that is also a tier name would break the collision argument
	// above, so it is rejected here rather than documented as a thing not to do.
	if (chain === "conservative" || chain === "leveraged") {
		throw new Error(`A chain key may not be a tier name: ${chainKey}`);
	}

	if (chain === LEGACY_UNSEGMENTED_CHAIN) {
		return `${VAULT_DERIVATION_PATH_VERSION}/${tier}/${normalised}`;
	}
	return `${VAULT_DERIVATION_PATH_VERSION}/${chain}/${tier}/${normalised}`;
}

/**
 * The one chain whose agent paths carry no chain segment.
 *
 * Base, because its vaults predate there being more than one chain. Permanent,
 * and not a thing to "clean up" later — the wallets these paths derive hold
 * positions, and tidying the format would strand them.
 */
export const LEGACY_UNSEGMENTED_CHAIN = "base";
