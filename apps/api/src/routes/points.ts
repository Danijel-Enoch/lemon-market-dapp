import { isDatabaseConfigured } from "@lemon/db";
import { Elysia, t } from "elysia";
import { getLeaderboard, getProfile, recordEvent } from "../services/points";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

export const pointsRoutes = new Elysia({ prefix: "/points" })
	/** Ranked points for addresses that have traded through this app. */
	.get(
		"/leaderboard",
		async ({ query }) => ({
			available: isDatabaseConfigured(),
			rows: await getLeaderboard(query.limit ?? 100),
		}),
		{ query: t.Object({ limit: t.Optional(t.Number({ minimum: 1, maximum: 500 })) }) },
	)

	.get(
		"/:address",
		async ({ params }) => {
			const profile = await getProfile(params.address);
			// Rank is resolved against the board so a profile page can show it
			// without the client having to fetch and scan the leaderboard.
			const board = await getLeaderboard(500).catch(() => []);
			const found = board.find((row) => row.address === profile.address);
			return { ...profile, rank: found?.rank ?? null };
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * Claim points for a transaction.
	 *
	 * The hash is verified on-chain before anything is awarded — it must exist,
	 * have succeeded, and have been sent by the claiming address. Only the spot
	 * leg produces a chain transaction, which is why it is the only claimable
	 * source: the short leg is an API call this server made itself, so there is
	 * nothing for a client to assert about it.
	 */
	.post(
		"/record",
		async ({ body, status }) => {
			if (!isDatabaseConfigured()) {
				return status(503, { error: "Points need a database. Set DATABASE_URL." });
			}

			const result = await recordEvent({
				userAddress: body.userAddress,
				source: body.source,
				volumeUsd: body.volumeUsd,
				txHash: body.txHash,
			});

			if (result.reason) return status(422, { error: result.reason, awarded: 0 });
			return result;
		},
		{
			body: t.Object({
				userAddress: addressSchema,
				source: t.Literal("SPOT_VOLUME"),
				volumeUsd: t.Optional(t.Number({ minimum: 0 })),
				txHash: t.String({ pattern: "^0x[a-fA-F0-9]{64}$" }),
			}),
		},
	);
