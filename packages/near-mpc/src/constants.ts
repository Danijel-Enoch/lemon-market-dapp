import type { NajPublicKey } from "./derivation";

export type NearNetwork = "mainnet" | "testnet";

/** The MPC signer contract, per network. */
export const MPC_CONTRACT: Record<NearNetwork, string> = {
	mainnet: "v1.signer",
	testnet: "v1.signer-prod.testnet",
};

export const NEAR_RPC_URL: Record<NearNetwork, string> = {
	mainnet: "https://rpc.mainnet.near.org",
	testnet: "https://rpc.testnet.near.org",
};

/**
 * Root public keys of each MPC deployment, one per curve.
 *
 * These are the contract's own `public_key` view values (domain 0 = secp256k1,
 * domain 1 = ed25519). They are pinned rather than fetched so address
 * derivation cannot silently follow a compromised or misconfigured RPC onto a
 * different key — a wrong root here means funds sent to an address nobody can
 * sign for. `NearMpcClient.verifyRootKeys()` checks them against the live
 * contract when a deployment wants belt and braces.
 */
export const MPC_ROOT_KEYS: Record<
	NearNetwork,
	{ secp256k1: NajPublicKey; ed25519: NajPublicKey }
> = {
	mainnet: {
		secp256k1:
			"secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya",
		ed25519: "ed25519:G9hwngxWNKdmqMCmU1Yt6LPhFpayJeKFxyAV1HqMNLtF",
	},
	testnet: {
		secp256k1:
			"secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3",
		ed25519: "ed25519:6vSEtQxrQj6txUMh33WC4ERyCWmNMRTdufDWAaDY3Un2",
	},
};

/** `domain_id` selects the curve on the signer contract. */
export const DOMAIN_ID = { secp256k1: 0, ed25519: 1 } as const;

/** 300 Tgas — the maximum, and what the signer contract expects. */
export const MAX_GAS = 300_000_000_000_000n;

/**
 * Ed25519 signing covers the message itself rather than a digest, so the
 * contract caps how much can be sent. Pacifica's canonical payloads and Solana
 * transaction messages both sit far below this, but a caller that concatenates
 * something unbounded should not discover the limit as an on-chain failure.
 */
export const MAX_EDDSA_PAYLOAD_BYTES = 1232;
