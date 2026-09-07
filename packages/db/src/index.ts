export * from "@prisma/client";

export { isDatabaseConfigured, prisma } from "./client";
export {
	FULL_WEIGHT_BPS,
	seedFoundingMarket,
	type VaultMarketConfig,
	validateWeights,
	vaultMarkets,
} from "./markets";
