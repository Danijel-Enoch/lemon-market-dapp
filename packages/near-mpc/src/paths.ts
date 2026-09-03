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
