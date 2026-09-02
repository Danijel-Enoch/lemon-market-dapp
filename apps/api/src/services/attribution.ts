import { encodeAttributionSuffix, type Hex } from "@lemon/core";
import { config } from "../config";

/**
 * ERC-8021 attribution suffix for the configured Avantis builder code.
 *
 * Computed once — it depends only on the code, which is fixed per deployment.
 * Returns null when no code is set, so callers append nothing rather than an
 * empty marker.
 */
let cached: Hex | null | undefined;

export function builderSuffix(): Hex | null {
	if (cached !== undefined) return cached;

	const code = config.fees.builderCode;
	if (!code) {
		cached = null;
		return cached;
	}

	try {
		cached = encodeAttributionSuffix([code]);
	} catch (error) {
		// A malformed code must not take trading down with it.
		console.warn("[attribution] invalid AVANTIS_BUILDER_CODE, fees will not be attributed:", error);
		cached = null;
	}
	return cached;
}

/**
 * Whether builder fees can actually be collected on a given execution path.
 *
 * Attribution is a calldata suffix, and on the gasless path the Avantis
 * operator builds the calldata itself — a suffix added here never reaches the
 * chain. Surfacing this lets the caller decide rather than assume a fee was
 * taken when it was not.
 */
export function canAttribute(mode: "transaction" | "intent"): boolean {
	return mode === "transaction" && builderSuffix() !== null;
}
