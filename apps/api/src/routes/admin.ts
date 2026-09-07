import { prisma } from "@lemon/db";
import { Elysia, t } from "elysia";
import {
	assertAdmin,
	assertCanCreateVaults,
	listVaultableMarkets,
	listVaultMarkets,
	prepareVault,
	recentRuns,
	recordVault,
	setAgentEnabled,
	setCloseOrder,
	setVaultMarkets,
} from "../services/admin";
import { readSession, SESSION_COOKIE } from "../services/auth";
import { getAllVaultGas, getVaultGas } from "../services/gas";
import { withdrawableGas, withdrawGas } from "../services/gas-withdraw";
import { pacificaAccountStatus, setUpPacificaAccount } from "../services/pacifica-account";
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

	/**
	 * What an agent's wallets could send back, net of the fee for sending it.
	 *
	 * Read before the withdraw form is offered, because "everything" has to mean
	 * a number the operator saw. These figures are lower than the balances on the
	 * gas panel by exactly the cost of the transfer.
	 */
	.get(
		"/gas/:address/withdrawable",
		async ({ admin, params }) => {
			await assertCanCreateVaults(admin);
			return withdrawableGas(params.address);
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * Take an agent's gas back out.
	 *
	 * The counterpart to topping it up, and it exists mostly for redeployment: a
	 * vault is immutable, so a new version of the protocol is a new set of agents
	 * — and the ETH and SOL an operator put into the old ones is stranded at
	 * wallets no private key exists for. This route is the only way to reach it.
	 *
	 * Native units only. Nothing here can move USDC, the spot token or a Pacifica
	 * balance: depositor capital leaves an agent through the vault's own
	 * `agentReturn` and nowhere else.
	 *
	 * `assertCanCreateVaults` rather than `assertAdmin`. A read-only admin
	 * watching for stale NAVs has no business moving funds, and this is the same
	 * permission that already gates deploying a vault.
	 */
	.post(
		"/gas/:address/withdraw",
		async ({ admin, params, body }) => {
			await assertCanCreateVaults(admin);
			return {
				withdrawal: await withdrawGas({
					vault: params.address,
					chain: body.chain,
					to: body.to,
					// An absent amount is a sweep. An empty string is a form field
					// nobody typed in, which means the same thing.
					amount: body.amount?.trim() || undefined,
				}),
			};
		},
		{
			params: t.Object({ address: addressSchema }),
			body: t.Object({
				chain: t.Union([t.Literal("BASE"), t.Literal("SOLANA")]),
				to: t.String({ minLength: 32, maxLength: 64 }),
				amount: t.Optional(t.String({ maxLength: 32 })),
			}),
		},
	)

	/**
	 * Whether the agent's Pacifica side is ready, and what is missing.
	 *
	 * Pacifica keys accounts by Solana address and registers one on its first
	 * deposit, so there is nothing to create there. What does need creating is
	 * the USDC token account the deposit is signed from — rent the agent's own
	 * wallet cannot pay, because it holds USDC and never SOL.
	 */
	.get(
		"/vaults/:address/pacifica",
		async ({ admin, params }) => {
			await assertAdmin(admin);
			return pacificaAccountStatus(params.address);
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * Create that token account, paid for by the deployment's fee payer.
	 *
	 * The bridge does this idempotently on the first crossing anyway, so this is
	 * not load-bearing — it moves the discovery of an empty or misconfigured fee
	 * payer from mid-bridge, with a depositor's capital already in the air, to
	 * vault creation, where the fix is free.
	 */
	.post(
		"/vaults/:address/pacifica",
		async ({ admin, params }) => {
			await assertCanCreateVaults(admin);
			return { setup: await setUpPacificaAccount(params.address) };
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
	)

	/** The markets this vault runs a basis position in, and their target weights. */
	.get(
		"/vaults/:address/markets",
		async ({ admin, params }) => {
			await assertAdmin(admin);
			return { markets: await listVaultMarkets(params.address) };
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * Set the whole list at once.
	 *
	 * The whole list rather than add/remove/reweight, because the weights are only
	 * meaningful together — three individually reasonable requests can leave a
	 * vault weighted to 140% between the second and the third, and an agent
	 * ticking in that window deploys against it.
	 *
	 * The body carries tickers and weights and nothing else. Letting a request
	 * name its own token address would be a way to point a live vault's agent at
	 * an arbitrary ERC-20; the pairing is resolved server-side from the same
	 * curated board the create flow uses.
	 */
	.put(
		"/vaults/:address/markets",
		async ({ admin, params, body }) => {
			await assertCanCreateVaults(admin);
			return { markets: await setVaultMarkets({ address: params.address, markets: body.markets }) };
		},
		{
			params: t.Object({ address: addressSchema }),
			body: t.Object({
				markets: t.Array(
					t.Object({
						ticker: t.String({ minLength: 1, maxLength: 16 }),
						targetWeightBps: t.Integer({ minimum: 1, maximum: 10_000 }),
					}),
					{ minItems: 1, maxItems: 20 },
				),
			}),
		},
	)

	/**
	 * Order every position closed and all capital returned to the vault — or lift
	 * that order.
	 *
	 * Not the same lever as stopping the agent, and the difference is the point. A
	 * stopped agent stops reporting, which stales the NAV and blocks the
	 * withdrawal queue an operator unwinding a vault is usually trying to serve.
	 * Under a close order the agent keeps ticking, keeps reporting, and keeps
	 * paying redemptions — it simply holds no position and opens no new one.
	 *
	 * Returns as soon as the instruction is recorded. Closing is minutes of venue
	 * round trips across two chains, so nothing here waits for it; the agent acts
	 * on its next tick and stamps `closeCompletedAt` when it first finds the vault
	 * flat. `assertCanCreateVaults` rather than `assertAdmin`, on the same
	 * reasoning as every other route that moves money.
	 */
	.post(
		"/vaults/:address/close",
		async ({ admin, params, body }) => {
			await assertCanCreateVaults(admin);
			return {
				vault: await setCloseOrder({
					address: params.address,
					closing: body.closing,
					reason: body.reason,
					by: admin as string,
				}),
			};
		},
		{
			params: t.Object({ address: addressSchema }),
			body: t.Object({
				closing: t.Boolean(),
				reason: t.Optional(t.String({ maxLength: 500 })),
			}),
		},
	);
