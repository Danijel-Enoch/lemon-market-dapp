import { prisma } from "@lemon/db";
import { Elysia, t } from "elysia";
import {
	assertAdmin,
	assertCanCreateVaults,
	listVaultableMarkets,
	prepareVault,
	recentRuns,
	recordVault,
	setAgentEnabled,
} from "../services/admin";
import { readSession, SESSION_COOKIE } from "../services/auth";
import { getAllVaultGas, getVaultGas } from "../services/gas";
import { getQueue, listVaults } from "../services/vaults";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

function sessionToken(cookie: Record<string, { value?: unknown } | undefined>): string | undefined {
	const value = cookie[SESSION_COOKIE]?.value;
	return typeof value === "string" ? value : undefined;
}

/**
 * The admin dashboard's API.
 *
 * Every route here is gated on a wallet signature that resolves to a row in
 * `AdminUser`, and an unauthorised caller gets a 404 rather than a 403 — the
 * existence of these routes is not something a stranger needs confirmed.
 *
 * The one thing this API deliberately cannot do is create a vault. Creation is a
 * transaction from the admin's own wallet: it commits capital and names the
 * agent that will hold it, and that should carry a human signature rather than
 * being something a leaked API key can do. What the server does is derive the
 * agent wallet, check the market, and record the result.
 */
export const adminRoutes = new Elysia({ prefix: "/admin" })
	.derive(async ({ cookie }) => {
		const session = await readSession(sessionToken(cookie));
		return { admin: session?.user.address };
	})

	/** Whether the caller is an admin at all. The dashboard's front door. */
	.get("/session", async ({ admin }) => {
		if (!admin) return { isAdmin: false, canCreateVaults: false };
		const record = await prisma.adminUser.findUnique({ where: { address: admin } });
		return {
			isAdmin: record !== null,
			canCreateVaults: record?.canCreateVaults ?? false,
			address: admin,
		};
	})

	/**
	 * Every basis market, annotated with which tiers already have a vault.
	 *
	 * A market that cannot be vaulted stays on the list with its reason attached
	 * rather than disappearing, so an operator can see that NVDA is unavailable
	 * because its pool has no route today — not conclude it was never listed.
	 */
	.get("/markets", async ({ admin }) => {
		await assertAdmin(admin);
		return { markets: await listVaultableMarkets() };
	})

	/**
	 * Derive the agent wallet for a proposed vault, and check the parameters.
	 *
	 * Creates nothing. The agent address must be known before the vault exists —
	 * the vault bakes it in and cannot change it — so this is also the one moment
	 * anyone looks at the wallet that is about to hold the whole position.
	 */
	.post(
		"/vaults/prepare",
		async ({ admin, body }) => {
			await assertCanCreateVaults(admin);
			return prepareVault({
				ticker: body.ticker,
				tier: body.tier,
				targetLeverageBps: body.targetLeverageBps,
				maxLeverageBps: body.maxLeverageBps,
			});
		},
		{
			body: t.Object({
				ticker: t.String({ minLength: 1, maxLength: 16 }),
				tier: t.Union([t.Literal("conservative"), t.Literal("leveraged")]),
				targetLeverageBps: t.Optional(t.Number({ minimum: 10_000, maximum: 30_000 })),
				maxLeverageBps: t.Optional(t.Number({ minimum: 10_000, maximum: 30_000 })),
			}),
		},
	)

	/**
	 * Record a vault the admin's wallet has just deployed.
	 *
	 * The venue configuration is written here and nowhere else. The agent refuses
	 * to trade a vault with no row, which is what stops a vault existing on-chain
	 * with an agent that has guessed which token "NVDA" means.
	 */
	.post(
		"/vaults",
		async ({ admin, body }) => {
			await assertCanCreateVaults(admin);
			const prepared = await prepareVault({ ticker: body.ticker, tier: body.tier });
			const record = await recordVault({
				address: body.address,
				prepared,
				spotTokenAddress: body.spotTokenAddress,
				spotTokenDecimals: body.spotTokenDecimals,
				spotTokenSymbol: body.spotTokenSymbol,
				perpSymbol: body.perpSymbol,
				assetClass: body.assetClass,
				createdBy: admin as string,
			});
			return { vault: record };
		},
		{
			body: t.Object({
				address: addressSchema,
				ticker: t.String({ minLength: 1, maxLength: 16 }),
				tier: t.Union([t.Literal("conservative"), t.Literal("leveraged")]),
				spotTokenAddress: addressSchema,
				spotTokenDecimals: t.Number({ minimum: 0, maximum: 36 }),
				spotTokenSymbol: t.String({ minLength: 1, maxLength: 32 }),
				perpSymbol: t.String({ minLength: 1, maxLength: 32 }),
				assetClass: t.Optional(t.String({ maxLength: 16 })),
			}),
		},
	)

	/**
	 * Every vault with its agent's health, which is what the dashboard watches.
	 *
	 * A stale NAV is the signal that matters most: it means the agent has stopped
	 * reporting, which blocks deposits and withdrawals on-chain until it resumes.
	 */
	.get("/vaults", async ({ admin }) => {
		await assertAdmin(admin);
		const [vaults, queue] = await Promise.all([listVaults(), getQueue()]);
		return { vaults, queue };
	})

	/**
	 * Gas in every agent's wallets.
	 *
	 * The one running cost the protocol cannot pay for itself: the vault holds
	 * USDC and may only send USDC to one address, so ETH on Base and SOL on
	 * Solana have to come from an operator. An agent out of gas does not crash —
	 * it silently fails every write until the vault goes stale.
	 */
	.get("/gas", async ({ admin }) => {
		await assertAdmin(admin);
		const vaults = await listVaults();
		const gas = await getAllVaultGas(vaults.map((v) => ({ address: v.address, ticker: v.ticker })));
		return { gas, needingTopUp: gas.filter((g) => g.needsTopUp).length };
	})

	.get(
		"/gas/:address",
		async ({ admin, params, status }) => {
			await assertAdmin(admin);
			const gas = await getVaultGas(params.address);
			if (!gas) return status(404, { error: `No vault at ${params.address}` });
			return gas;
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/** Recent agent decisions, so "why did it sit idle" has an answer. */
	.get(
		"/runs",
		async ({ admin, query }) => {
			await assertAdmin(admin);
			return { runs: await recentRuns(query.vault, query.limit ? Number(query.limit) : 50) };
		},
		{ query: t.Object({ vault: t.Optional(addressSchema), limit: t.Optional(t.String()) }) },
	)

	/**
	 * Stop or start an agent without touching the contract.
	 *
	 * Pausing the vault on-chain would also stop users depositing and the
	 * guardian fulfilling. This is the narrower tool: the agent stands down, the
	 * vault keeps working.
	 */
	.post(
		"/vaults/:address/agent",
		async ({ admin, params, body }) => {
			await assertCanCreateVaults(admin);
			return { vault: await setAgentEnabled(params.address, body.enabled) };
		},
		{
			params: t.Object({ address: addressSchema }),
			body: t.Object({ enabled: t.Boolean() }),
		},
	);
