import { defineChain } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Chain } from "wagmi/chains";

/**
 * The chain this build talks to, described well enough to *add* to a wallet.
 *
 * A wagmi config can name a chain the user's wallet has never heard of — a local
 * fork, Base Sepolia, Vibenet — and `wallet_addEthereumChain` will add it on
 * demand. But only if the chain object carries everything that RPC call needs:
 * a name, a native currency, at least one HTTP RPC URL, and ideally an explorer.
 * A chain assembled from an id alone gets silently rejected by MetaMask, which
 * is why this builds the whole object rather than patching `base` with a
 * different transport.
 *
 * Configured from `VITE_` variables so one build artefact can be pointed at a
 * fork, a testnet or mainnet without a code change — the same way the server
 * side already reads `CHAIN_ID` and `BASE_RPC_URL`.
 */

/**
 * Chains we can describe completely from an id alone.
 *
 * Vibenet is not in viem's registry, so it is spelled out here; the other two
 * come from viem and are re-exported unchanged, which keeps their canonical
 * multicall and contract addresses rather than a hand-copied subset.
 */
const BASE_VIBENET = defineChain({
	id: 84_538_453,
	name: "Base Vibenet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: ["https://rpc.vibes.base.org"] } },
	blockExplorers: {
		default: { name: "Vibenet Explorer", url: "https://explorer.vibes.base.org" },
	},
	testnet: true,
});

const KNOWN: Record<number, Chain> = {
	[base.id]: base,
	[baseSepolia.id]: baseSepolia,
	[BASE_VIBENET.id]: BASE_VIBENET,
};

/** The subset of the build environment this reads. */
export interface ChainEnv {
	VITE_CHAIN_ID?: string;
	VITE_CHAIN_NAME?: string;
	VITE_CHAIN_RPC_URL?: string;
	VITE_CHAIN_EXPLORER_URL?: string;
	/** The older, narrower variable. Still honoured so existing `.env` files work. */
	VITE_BASE_RPC_URL?: string;
}

/**
 * Build the chain from configuration, falling back to Base mainnet.
 *
 * An unknown id is not an error. It is the local-fork case, and the whole point
 * of `wallet_addEthereumChain` is that a wallet does not need to know a chain in
 * advance — so an id with an RPC URL is enough to construct something addable,
 * and only an id with *no* RPC URL is unusable.
 */
export function buildChain(source: ChainEnv): Chain {
	const read = (key: keyof ChainEnv) => {
		const trimmed = source[key]?.trim();
		return trimmed ? trimmed : undefined;
	};

	const id = Number(read("VITE_CHAIN_ID") ?? base.id);
	const rpcUrl = read("VITE_CHAIN_RPC_URL") ?? read("VITE_BASE_RPC_URL");
	const name = read("VITE_CHAIN_NAME");
	const explorer = read("VITE_CHAIN_EXPLORER_URL");

	const known = KNOWN[id];

	if (!Number.isFinite(id) || id <= 0) return base;

	if (known && !rpcUrl && !name && !explorer) return known;

	if (!known && !rpcUrl) {
		// Nothing can be built and nothing can be added. Falling back to Base is
		// wrong in a quieter way than throwing at module scope would be: the app
		// still renders, and every write reports the wrong-network state rather
		// than the whole page failing to load.
		console.warn(
			`[wallet] VITE_CHAIN_ID=${id} is not a chain this build knows, and no VITE_CHAIN_RPC_URL was given. Falling back to Base mainnet.`,
		);
		return base;
	}

	const fallback = known ?? base;

	return defineChain({
		...(known ?? {}),
		id,
		name: name ?? known?.name ?? `Chain ${id}`,
		nativeCurrency: known?.nativeCurrency ?? { name: "Ether", symbol: "ETH", decimals: 18 },
		rpcUrls: {
			default: { http: [rpcUrl ?? fallback.rpcUrls.default.http[0]] },
		},
		blockExplorers: explorer
			? { default: { name: name ? `${name} Explorer` : "Explorer", url: explorer } }
			: known?.blockExplorers,
		testnet: known?.testnet ?? id !== base.id,
	});
}

/** The one chain every wallet interaction in this build targets. */
export const APP_CHAIN: Chain = buildChain(import.meta.env as ChainEnv);

/** True when this build is pointed somewhere other than Base mainnet. */
export const IS_NON_CANONICAL_CHAIN =
	APP_CHAIN.id !== base.id || APP_CHAIN.rpcUrls.default.http[0] !== base.rpcUrls.default.http[0];

export const APP_CHAIN_RPC_URL = APP_CHAIN.rpcUrls.default.http[0];
