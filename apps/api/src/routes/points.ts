import { isDatabaseConfigured } from "@lemon/db";
import { Elysia, t } from "elysia";
import { getGlobalLeaderboard, getLeaderboard, getProfile, recordEvent } from "../services/points";

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

	/**
	 * Avantis' protocol-wide board, kept separate from ours.
	 *
	 * It ranks all Avantis traders by realised PnL rather than activity here, so
	 * merging the two would misrepresent both.
	 */
	.get("/global", async () => ({ rows: await getGlobalLeaderboard() }))

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
	 * have succeeded, and have been sent by the claiming address. Perp volume is
	 * deliberately not claimable here: it is read from Avantis directly, so
	 * there is nothing for a client to assert.
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
				source: t.Union([
					t.Literal("SPOT_VOLUME"),
					t.Literal("CARRY_OPENED"),
					t.Literal("BASKET_ENTRY"),
				]),
				volumeUsd: t.Optional(t.Number({ minimum: 0 })),
				txHash: t.String({ pattern: "^0x[a-fA-F0-9]{64}$" }),
			}),
		},
	);
