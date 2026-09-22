import type { Address } from "./types";

/**
 * The chains this app can custody a vault on.
 *
 * This file used to be four constants and two URL builders, all of them Base.
 * That was correct while there was one deployment, and it is the thing that has
 * to change first to have more than one — every other Base assumption in the
 * codebase is downstream of these names.
 *
 * What has *not* changed is the rule those constants encoded: a chain is a fact
 * about a deployment, not a number read from the environment. A vault lives on
 * exactly one chain, that chain is baked into the vault's row at creation, and
 * nothing anywhere derives it from a connected wallet or a query parameter. An
 * id that could be anything would only ever name a chain with no factory on it,
 * and the failure mode is a process that runs cleanly and serves an empty app.
 *
 * So this is a closed registry of three, not an open map. Adding a fourth is an
 * edit here plus a deploy, which is the correct amount of ceremony.
 */

/** Base mainnet. The founding deployment, and the default everywhere one is needed. */
export const BASE_CHAIN_ID = 8453 as const;
/** Arbitrum One. */
export const ARBITRUM_CHAIN_ID = 42161 as const;
/** X Layer mainnet (OKX, Polygon CDK zkEVM). Native gas is OKB, not ETH. */
export const XLAYER_CHAIN_ID = 196 as const;

export const SUPPORTED_CHAIN_IDS = [BASE_CHAIN_ID, ARBITRUM_CHAIN_ID, XLAYER_CHAIN_ID] as const;

export type ChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * The short, lowercase name a chain is known by outside of Solidity.
 *
 * Load-bearing in three places that must agree: Ponder's `chains` map keys, the
 * `_BASE` / `_ARBITRUM` / `_XLAYER` suffix on this deployment's environment
 * variables, and the chain segment of an agent's MPC derivation path. Renaming
 * one of these repoints agent wallets, so treat it as permanent.
 */
export type ChainKey = "base" | "arbitrum" | "xlayer";

/**
 * Whether the quote asset below has been checked against the chain it names.
 *
 * Not decoration. `symbol()` and `decimals()` for the Base entry were read off
 * mainnet; the X Layer entry was not, because X Layer's USDC is bridged rather
 * than Circle-issued and there is more than one contract on that chain
 * answering to the name. A vault deployed against the wrong one accepts a token
 * nobody wants and quotes every balance off by however many decimals it has.
 *
 * `scripts/verify-chain-assets.ts` reads both fields on chain and tells you
 * which entries here are still taken on trust. `scripts/deploy-contracts.sh`
 * refuses to deploy against an `unverified` asset unless the operator passes
 * the address explicitly, which is the point: the check cannot be skipped by
 * forgetting it existed.
 */
export type AssetStatus = "verified" | "unverified";

export interface ChainInfo {
	id: ChainId;
	key: ChainKey;
	/** As a person would say it. Used in UI copy and operator errors. */
	name: string;
	/** The `_SUFFIX` on every per-chain environment variable for this chain. */
	envSuffix: "BASE" | "ARBITRUM" | "XLAYER";
	/** What this chain charges gas in. Agents need it; the vault never holds it. */
	nativeSymbol: "ETH" | "OKB";
	/** The vault's asset. Always a 6-decimal USDC, and always checked, not assumed. */
	usdc: Address;
	usdcDecimals: 6;
	usdcStatus: AssetStatus;
	explorerName: string;
	/** No trailing slash. */
	explorerUrl: string;
}

export const CHAIN_REGISTRY: Record<ChainId, ChainInfo> = {
	[BASE_CHAIN_ID]: {
		id: BASE_CHAIN_ID,
		key: "base",
		name: "Base",
		envSuffix: "BASE",
		nativeSymbol: "ETH",
		/** Circle-issued. Verified against Base mainnet. */
		usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		usdcDecimals: 6,
		usdcStatus: "verified",
		explorerName: "Basescan",
		explorerUrl: "https://basescan.org",
	},
	[ARBITRUM_CHAIN_ID]: {
		id: ARBITRUM_CHAIN_ID,
		key: "arbitrum",
		name: "Arbitrum One",
		envSuffix: "ARBITRUM",
		nativeSymbol: "ETH",
		/**
		 * Circle-issued native USDC. Confirmed against the chain.
		 *
		 * *Not* the bridged `USDC.e` at `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`,
		 * which is the same trap X Layer sets below: both answer
		 * `symbol() = "USDC"` with six decimals, and both are real. What separates
		 * them is supply — roughly 2.66B here against 48.5M for the bridged one —
		 * and `name()`, which reads "USD Coin" here and "USD Coin (Arb1)" there.
		 * Neither difference is something this codebase can check, so a vault
		 * deployed against the wrong one would look entirely healthy while holding
		 * the token with a fiftieth of the liquidity.
		 */
		usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
		usdcDecimals: 6,
		usdcStatus: "verified",
		explorerName: "Arbiscan",
		explorerUrl: "https://arbiscan.io",
	},
	[XLAYER_CHAIN_ID]: {
		id: XLAYER_CHAIN_ID,
		key: "xlayer",
		name: "X Layer",
		envSuffix: "XLAYER",
		nativeSymbol: "OKB",
		/**
		 * Bridged; there is no Circle-native issuance on X Layer.
		 *
		 * Confirmed against the chain, and worth recording *how*, because X Layer
		 * carries more than one contract that passes every automated check.
		 * `0x74b7F163…` also answers `symbol() = "USDC"` with six decimals and is
		 * also a real token — it simply is not the one with the liquidity, holding
		 * roughly 1.1M against this one's 18.9M. A vault deployed against it would
		 * take deposits nobody could route out of, and nothing in this codebase
		 * could have told the difference: the decimals match, the symbol matches,
		 * and the balance arithmetic is valid either way.
		 *
		 * That is the whole reason `usdcStatus` exists, and the reason
		 * `verify-chain-assets.ts` refuses to flip an entry to "verified" on its
		 * own. Two fields read from a contract cannot answer "is this the token
		 * people actually hold" — only a person looking at the chain can.
		 */
		usdc: "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
		usdcDecimals: 6,
		usdcStatus: "verified",
		explorerName: "OKLink",
		explorerUrl: "https://www.oklink.com/xlayer",
	},
};

/** Where anything that needs *a* chain and was not told which one starts. */
export const DEFAULT_CHAIN_ID: ChainId = BASE_CHAIN_ID;

export function isSupportedChainId(id: number | string | undefined | null): id is ChainId {
	return SUPPORTED_CHAIN_IDS.includes(Number(id) as ChainId);
}

/** The chain, or null. For anywhere a caller-supplied id is untrusted input. */
export function chainInfo(id: number | string | undefined | null): ChainInfo | null {
	return isSupportedChainId(id) ? CHAIN_REGISTRY[Number(id) as ChainId] : null;
}

/**
 * The chain, or an error naming what was asked for and what exists.
 *
 * For call sites where an unsupported id is a configuration mistake rather than
 * a bad request — a deploy pointed at the wrong network, an agent handed a vault
 * row from a chain this build does not know about. Failing loudly there is the
 * whole point; the alternative is defaulting to Base and writing one chain's
 * transactions against another chain's addresses.
 */
export function requireChainInfo(id: number | string | undefined | null): ChainInfo {
	const info = chainInfo(id);
	if (info) return info;
	const known = SUPPORTED_CHAIN_IDS.map((c) => `${CHAIN_REGISTRY[c].name} (${c})`).join(", ");
	throw new Error(`Chain ${id} is not one this build supports. Known chains: ${known}.`);
}

export function chainByKey(key: string): ChainInfo | null {
	return SUPPORTED_CHAIN_IDS.map((id) => CHAIN_REGISTRY[id]).find((c) => c.key === key) ?? null;
}

/** Every chain, in registry order. Base first, because it is the default. */
export function allChains(): ChainInfo[] {
	return SUPPORTED_CHAIN_IDS.map((id) => CHAIN_REGISTRY[id]);
}

// ---------------------------------------------------------------------------
// Quote asset
// ---------------------------------------------------------------------------

/**
 * USDC on Base.
 *
 * Kept as a named export because it is what the spot registry, the Relay client
 * and the bridge mean when they say "USDC" — all three of those are Base-side
 * by construction today, and spelling it `CHAIN_REGISTRY[BASE_CHAIN_ID].usdc`
 * at each of those call sites would obscure rather than clarify that.
 *
 * Anything that works on *a vault's* asset must use `usdcFor(vault.chainId)`.
 */
export const USDC_ADDRESS = CHAIN_REGISTRY[BASE_CHAIN_ID].usdc;
/** Every chain in this registry quotes in a six-decimal USDC. Asserted, not assumed. */
export const USDC_DECIMALS = 6 as const;

export function usdcFor(chainId: number | string | undefined | null): Address {
	return requireChainInfo(chainId).usdc;
}

/** The address aggregators use to mean "native ETH" rather than an ERC-20. */
export const NATIVE_TOKEN_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// Explorers
// ---------------------------------------------------------------------------

/**
 * A link to a transaction on the chain it actually happened on.
 *
 * The chain id is first and required, with no default. Defaulting it would make
 * every un-migrated call site silently produce a Basescan link for an Arbitrum
 * hash — a link that resolves to a valid-looking "transaction not found" page
 * rather than an error, which is the worst of both.
 */
export function explorerTx(chainId: number | string, hash: string): string {
	return `${requireChainInfo(chainId).explorerUrl}/tx/${hash}`;
}

export function explorerAddress(chainId: number | string, address: string): string {
	return `${requireChainInfo(chainId).explorerUrl}/address/${address}`;
}

/** A token, optionally scoped to one holder's balance of it. */
export function explorerToken(chainId: number | string, token: string, holder?: string): string {
	const url = `${requireChainInfo(chainId).explorerUrl}/token/${token}`;
	return holder ? `${url}?a=${holder}` : url;
}

/** The explorer's name, for link text that says where it goes. */
export function explorerName(chainId: number | string): string {
	return requireChainInfo(chainId).explorerName;
}
