import { type Chain, defineChain } from "viem";
import { base, baseSepolia } from "viem/chains";

/**
 * The chain this agent writes to.
 *
 * Pinned to `base` until a deployment needed to sit somewhere else, at which
 * point the pin stopped being a simplification and became a bug: viem takes the
 * chain id from this object when it signs, so an agent pointed at Vibenet with
 * `base` here signs every transaction for 8453 and the node rejects all of them.
 *
 * The browser has the same problem and solves it in `@lemon/wallet`, but that
 * reads `import.meta.env` and is bundled by Vite. This is a Bun process reading
 * `process.env`, so the two cannot share an implementation — only the reasoning.
 * Unlike the browser's, this one does not need to be complete enough for a
 * wallet to *add*: nothing here prompts a user, it only signs.
 */
const KNOWN: Record<number, Chain> = {
	[base.id]: base,
	[baseSepolia.id]: baseSepolia,
};

export function resolveAgentChain(): Chain {
	const id = Number(process.env.CHAIN_ID ?? base.id);
	const rpcUrl = process.env.BASE_RPC_URL?.trim();

	if (!Number.isFinite(id) || id <= 0) return base;

	const known = KNOWN[id];
	if (known && !rpcUrl) return known;

	return defineChain({
		...(known ?? {}),
		id,
		name: known?.name ?? `Chain ${id}`,
		nativeCurrency: known?.nativeCurrency ?? { name: "Ether", symbol: "ETH", decimals: 18 },
		rpcUrls: {
			default: { http: [rpcUrl ?? known?.rpcUrls.default.http[0] ?? base.rpcUrls.default.http[0]] },
		},
	});
}
