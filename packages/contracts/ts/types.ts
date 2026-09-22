/**
 * Mirrors of the on-chain enums and units.
 *
 * Solidity encodes an enum as its index, so an event arrives as `kind: 3` and
 * means nothing until something maps it back. Keeping that mapping here — next
 * to the ABI it decodes, in one package — is what stops the indexer, the API and
 * the UI each keeping their own copy and drifting apart the first time a member
 * is inserted rather than appended.
 *
 * The arrays are ordered to match the Solidity declarations exactly. Adding a
 * member anywhere but the end changes every index after it, so append only.
 */

/** `LemonVault.RiskTier` */
export const RISK_TIERS = ["CONSERVATIVE", "LEVERAGED"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/** `LemonVault.ActivityKind` — every action the agent reports to the public feed. */
export const ACTIVITY_KINDS = [
	"SPOT_BUY",
	"SPOT_SELL",
	"PERP_OPEN",
	"PERP_CLOSE",
	"PERP_REBALANCE",
	"BRIDGE_OUT",
	"BRIDGE_IN",
	"VENUE_DEPOSIT",
	"VENUE_WITHDRAW",
	"FUNDING_SETTLED",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * `LemonVault.Chain` — an EVM chain holds custody, Solana runs the perp, NEAR signs.
 *
 * Positional, and must stay in the same order as the Solidity enum: the contract
 * emits the index and this array is how it is read back. Append only. See the
 * `@dev` note on `LemonVault.Chain` for what reordering costs.
 */
export const CHAINS = ["BASE", "SOLANA", "NEAR", "ARBITRUM", "XLAYER"] as const;
export type Chain = (typeof CHAINS)[number];

export function riskTierFromIndex(index: number): RiskTier {
	const tier = RISK_TIERS[index];
	if (!tier) throw new Error(`Unknown RiskTier index ${index}`);
	return tier;
}

export function activityKindFromIndex(index: number): ActivityKind {
	const kind = ACTIVITY_KINDS[index];
	if (!kind) throw new Error(`Unknown ActivityKind index ${index}`);
	return kind;
}

export function chainFromIndex(index: number): Chain {
	const chain = CHAINS[index];
	if (!chain) throw new Error(`Unknown Chain index ${index}`);
	return chain;
}

/**
 * Basis points, the unit every rate in the vault is quoted in.
 *
 * Leverage included: `10_000` is 1x and `30_000` is 3x. One unit for rates and
 * multipliers alike means there is no call site where a "2" could plausibly mean
 * either 2x or 0.02%.
 */
export const BPS = 10_000;

export const NO_LEVERAGE_BPS = 10_000;
export const MAX_LEVERAGE_BPS = 30_000;

/** USDC has six decimals; vault shares have eighteen. */
export const ASSET_DECIMALS = 6;
export const SHARE_DECIMALS = 18;

/** ERC-7540 lets a vault with fungible requests use one id. This one does. */
export const REQUEST_ID = 0n;

export function leverageToX(bps: number | bigint): number {
	return Number(bps) / BPS;
}

export function formatLeverage(bps: number | bigint): string {
	const x = leverageToX(bps);
	// "1x" reads better than "1.0x" for the conservative tier, where the whole
	// point is that there is no leverage to put a decimal on.
	return Number.isInteger(x) ? `${x}x` : `${x.toFixed(2)}x`;
}
