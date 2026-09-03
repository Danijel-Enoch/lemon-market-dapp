import type { User } from "@lemon/db";

/**
 * Builder-code attribution.
 *
 * Pacifica charges the builder's fee on an attributed order and rejects the
 * order outright when the fee exceeds what the user approved — it does not fall
 * back to an unattributed fill. That single behaviour shapes everything here:
 * a code is attached only when this exact user has approved this exact code at
 * a ceiling that still covers it, and anything less certain forgoes the fee
 * rather than risking the trade.
 */

export interface BuilderConfig {
	code: string;
	/** The ceiling users are asked to approve, as a decimal fraction. */
	maxFeeRate: string;
}

/**
 * Sanity ceiling on what users are asked to approve: 1% of order value.
 *
 * Not a Pacifica limit — a guard against a typo. `max_fee_rate` is a decimal
 * fraction, so a value meant as "0.001" typed as "1" would ask every user to
 * approve a 100% fee, and the number would not look obviously wrong in a
 * signing dialog.
 */
export const MAX_BUILDER_FEE_RATE = 0.01;

/**
 * Validate a configured builder code and rate, or return null.
 *
 * Both are required together: a code with no rate would have users approving an
 * unbounded fee, and a rate with no code attributes nothing. Rejecting here
 * rather than at order time means a misconfiguration costs the fee, never the
 * trade.
 */
export function parseBuilderConfig(
	code: string | undefined,
	maxFeeRate: string | undefined,
	warn: (message: string) => void = console.warn,
): BuilderConfig | null {
	if (!code || !maxFeeRate) return null;

	// Pacifica's own constraint, per the builder program docs.
	if (!/^[a-zA-Z0-9]{3,16}$/.test(code)) {
		warn(
			`[config] PACIFICA_BUILDER_CODE="${code}" is not 3-16 alphanumeric characters; builder attribution disabled.`,
		);
		return null;
	}

	const rate = Number(maxFeeRate);
	if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_BUILDER_FEE_RATE) {
		warn(
			`[config] PACIFICA_BUILDER_MAX_FEE_RATE="${maxFeeRate}" is outside (0, ${MAX_BUILDER_FEE_RATE}]; builder attribution disabled.`,
		);
		return null;
	}

	return { code, maxFeeRate };
}

/**
 * The builder code to attach to this user's orders, or undefined.
 *
 * Returns nothing unless the user approved *this* code at a ceiling that still
 * covers *this* rate. Attaching an unapproved code would have Pacifica reject
 * the order outright, so an unattributed fill is the strictly better failure —
 * the fee is lost, the trade is not.
 *
 * The configuration is passed in rather than read from a module singleton:
 * `config` builds its value with `parseBuilderConfig` below, and reaching back
 * for it here would make the two modules import each other.
 */
export function builderCodeFor(user: User, builder: BuilderConfig | null): string | undefined {
	if (!builder) return undefined;

	const approved =
		user.pacificaBuilderApprovedAt !== null &&
		user.pacificaBuilderCode === builder.code &&
		user.pacificaBuilderMaxFeeRate !== null &&
		Number(user.pacificaBuilderMaxFeeRate) >= Number(builder.maxFeeRate);

	return approved ? builder.code : undefined;
}

/**
 * Whether this user still needs to approve the configured builder code.
 *
 * True for someone who onboarded before a code was configured, or whose
 * approved ceiling no longer covers the current one. Surfaced to the UI so it
 * can ask, rather than silently forgoing the fee for the life of the account.
 */
export function needsBuilderApproval(user: User, builder: BuilderConfig | null): boolean {
	return builder !== null && !builderCodeFor(user, builder);
}
