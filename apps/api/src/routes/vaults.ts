import { Elysia, t } from "elysia";
import { getLivePosition } from "../services/position";
import {
	getFundingSeries,
	getNavSeries,
	getPortfolio,
	getProtocolStats,
	getQueue,
	getTransfers,
	getVault,
	listActivity,
	listVaults,
} from "../services/vaults";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

/**
 * Everything a user can read.
 *
 * No authentication anywhere in this file, on purpose. A vault's balances, its
 * yield history and every action its agent took are public facts about money the
 * protocol is holding on other people's behalf — gating them behind a session
 * would mean the only people who could audit the system are the people already
 * inside it.
 */
export const vaultRoutes = new Elysia({ prefix: "/vaults" })
	.get("/", async () => {
		const vaults = await listVaults();
		return { vaults, count: vaults.length };
	})

	.get("/stats", async () => getProtocolStats())

	/**
	 * The protocol-wide activity feed.
	 *
	 * Declared before `/:address` because Elysia matches in order and "activity"
	 * would otherwise be read as an address and 422 on the pattern.
	 */
	.get(
		"/activity",
		async ({ query }) =>
			listActivity({
				limit: query.limit ? Number(query.limit) : undefined,
				kind: query.kind,
				chain: query.chain,
			}),
		{
			query: t.Object({
				limit: t.Optional(t.String()),
				kind: t.Optional(t.String()),
				chain: t.Optional(t.String()),
			}),
		},
	)

	/** The withdrawal queue, across every vault or one of them. */
	.get("/queue", async ({ query }) => getQueue(query.vault), {
		query: t.Object({ vault: t.Optional(addressSchema) }),
	})

	.get(
		"/:address",
		async ({ params, status }) => {
			const vault = await getVault(params.address);
			if (!vault) return status(404, { error: `No vault at ${params.address}` });
			return vault;
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * The share-price series.
	 *
	 * Served raw rather than as a single yield number so the chart and the
	 * headline APY are demonstrably the same data. A reader who does not believe
	 * the percentage can recompute it from this.
	 */
	.get(
		"/:address/nav",
		async ({ params, query }) => getNavSeries(params.address, Number(query.days ?? 30)),
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({ days: t.Optional(t.String()) }),
		},
	)

	/**
	 * Funding paid, per UTC day.
	 *
	 * The same rows the activity feed shows under the FUNDING_SETTLED filter,
	 * bucketed — so the chart and the feed cannot disagree about what a day paid.
	 */
	.get(
		"/:address/funding",
		async ({ params, query }) =>
			getFundingSeries(params.address, {
				days: query.days ? Number(query.days) : undefined,
				hours: query.hours ? Number(query.hours) : undefined,
			}),
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({ days: t.Optional(t.String()), hours: t.Optional(t.String()) }),
		},
	)

	.get(
		"/:address/activity",
		async ({ params, query }) =>
			listActivity({
				vault: params.address,
				limit: query.limit ? Number(query.limit) : undefined,
				before: query.before,
				kind: query.kind,
				chain: query.chain,
			}),
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({
				limit: t.Optional(t.String()),
				before: t.Optional(t.String()),
				kind: t.Optional(t.String()),
				chain: t.Optional(t.String()),
			}),
		},
	)

	/**
	 * What the vault is holding right now, read from the venues themselves.
	 *
	 * Not the agent's account of its position — the actual ERC-20 balance on Base
	 * and the actual Pacifica account, both public, both at addresses shown in
	 * the response so a reader can fetch them independently.
	 */
	.get(
		"/:address/position",
		async ({ params, status }) => {
			const position = await getLivePosition(params.address);
			if (!position) return status(404, { error: `No vault at ${params.address}` });
			return position;
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/** Capital crossing the vault boundary — the other half of the money trail. */
	.get("/:address/transfers", async ({ params }) => getTransfers(params.address), {
		params: t.Object({ address: addressSchema }),
	})

	/**
	 * One address's holdings and pending withdrawals.
	 *
	 * Keyed by the address in the path rather than by the session, so anyone can
	 * look up anyone. Share balances are public ERC-20 state; pretending
	 * otherwise would be privacy theatre over data already on Basescan.
	 */
	.get("/portfolio/:owner", async ({ params }) => getPortfolio(params.owner), {
		params: t.Object({ owner: addressSchema }),
	});
