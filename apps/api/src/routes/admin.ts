import { isSupportedChainId } from "@lemon/core";
import { prisma } from "@lemon/db";
import { Elysia, t } from "elysia";
import {
	AdminError,
	assertAdmin,
	assertCanCreateVaults,
	listVaultableMarkets,
	listVaultMarkets,
	prepareVault,
	recentRuns,
	recordVault,
	requestRebalance,
	setAgentEnabled,
	setCloseOrder,
	setVaultMarkets,
} from "../services/admin";
import { readSession, SESSION_COOKIE } from "../services/auth";
import { getAllVaultGas, getVaultGas } from "../services/gas";
import { withdrawableGas, withdrawGas } from "../services/gas-withdraw";
import { indexerHealth } from "../services/indexer-health";
import {
	OPERATOR_STEPS,
	positionSnapshot,
	recentOperatorActions,
	startOperatorAction,
} from "../services/operator-actions";
import { pacificaAccountStatus, setUpPacificaAccount } from "../services/pacifica-account";
import { getQueue, listVaults } from "../services/vaults";

/**
 * A chain id from a request, or undefined.
 *
 * Undefined rather than a default, because the two mean different things
 * downstream: every service here resolves an omitted chain by looking the
 * address up and refusing if it is ambiguous, which is safer than silently
 * assuming Base. Anything present but unknown is rejected outright — a caller
 * that named a chain meant it, and quietly substituting another would act on a
 * different vault than the one asked for.
 */
function chainOf(raw: string | number | undefined): number | undefined {
	if (raw === undefined || raw === "") return undefined;
	const id = Number(raw);
	if (!isSupportedChainId(id)) {
		throw new AdminError(`Chain ${raw} is not one this deployment supports.`, 400);
	}
	return id;
}

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
	.get(
		"/markets",
		async ({ admin, query }) => {
			await assertAdmin(admin);
			return { markets: await listVaultableMarkets(chainOf(query.chainId)) };
		},
		{ query: t.Object({ chainId: t.Optional(t.String()) }) },
	)

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
				chainId: chainOf(body.chainId),
				targetLeverageBps: body.targetLeverageBps,
				maxLeverageBps: body.maxLeverageBps,
			});
		},
		{
			body: t.Object({
				ticker: t.String({ minLength: 1, maxLength: 16 }),
				tier: t.Union([t.Literal("conservative"), t.Literal("leveraged")]),
				/** Which chain to deploy on. Omitted means this deployment's primary chain. */
				chainId: t.Optional(t.Number()),
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
			// Re-derived rather than taken from the client. The agent wallet is
			// baked into the vault at construction and the chain is baked into the
			// path that derives it, so a `chainId` that disagreed with the one the
			// factory was called on would record a vault whose agent nobody controls.
			const prepared = await prepareVault({
				ticker: body.ticker,
				tier: body.tier,
				chainId: chainOf(body.chainId),
			});
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
				chainId: t.Optional(t.Number()),
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
	 * Whether the read model can be believed.
	 *
	 * Deliberately the one admin route that does not touch the database or the
	 * indexer's data — only its health. Everything else on the dashboard is
	 * downstream of the indexer, so a route that needed the indexer to be working
	 * in order to report that it was not would be no use on the day it mattered.
	 *
	 * `assertAdmin`, not `assertCanCreateVaults`: watching for a broken read model
	 * is exactly what a read-only operator is for.
	 */
	.get("/indexer", async ({ admin }) => {
		await assertAdmin(admin);
		return await indexerHealth();
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
					chain: body.chain === "BASE" ? "EVM" : body.chain,
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
				/**
				 * Which of the agent's two wallets, not which chain.
				 *
				 * `"BASE"` is still accepted and means `"EVM"`. An admin console
				 * from before this change sends it, and a deployment updates the
				 * API and the static bundle at slightly different moments — so a
				 * rejected value here would be a 422 on a route an operator reaches
				 * for precisely when they are trying to recover funds.
				 */
				chain: t.Union([t.Literal("EVM"), t.Literal("BASE"), t.Literal("SOLANA")]),
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
		async ({ admin, params, query }) => {
			await assertAdmin(admin);
			return { markets: await listVaultMarkets(params.address, chainOf(query.chainId)) };
		},
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({ chainId: t.Optional(t.String()) }),
		},
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
			return {
				markets: await setVaultMarkets({
					address: params.address,
					chainId: chainOf(body.chainId),
					markets: body.markets,
				}),
			};
		},
		{
			params: t.Object({ address: addressSchema }),
			body: t.Object({
				/** Omitted, the address is resolved — and refused if it names more than one vault. */
				chainId: t.Optional(t.Number()),
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
	/**
	 * Ask the agent to correct the hedge on its next tick.
	 *
	 * One-shot, unlike the close order below: it lowers the drift threshold to
	 * zero for a single tick and nothing else. It does not bypass the venue's
	 * minimum order notional, so on a position too small to trade the answer
	 * comes back as an outcome rather than as silence.
	 *
	 * Returns as soon as the request is recorded. The agent ticks on its own
	 * interval and stamps `rebalanceCompletedAt` with what it did — or with why
	 * it could not.
	 */
	.post(
		"/vaults/:address/rebalance",
		async ({ admin, params }) => {
			await assertCanCreateVaults(admin);
			return { vault: await requestRebalance({ address: params.address, by: admin as string }) };
		},
		{ params: t.Object({ address: addressSchema }) },
	)

	/**
	 * Close a vault's position by hand, one step at a time.
	 *
	 * The route above records an instruction for the agent. These three do the
	 * work here, in this process, with the agent's own venue wiring — which is
	 * what an operator needs when the agent is stopped, is on a build that
	 * predates a fix the position needs, or has failed part-way through a close
	 * and left one leg open. See `services/operator-actions.ts` for why that is a
	 * separate lever rather than a use of the close order.
	 *
	 * `assertCanCreateVaults`, like every other route that moves money. A
	 * read-only operator watching for stale NAVs has no business selling a
	 * depositor's position.
	 */
	.get(
		"/vaults/:address/position",
		async ({ admin, params, query }) => {
			await assertAdmin(admin);
			return await positionSnapshot(params.address, chainOf(query.chainId));
		},
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({ chainId: t.Optional(t.String()) }),
		},
	)

	/**
	 * The steps run against this vault, newest first.
	 *
	 * Separate from the snapshot above, and cheap: one indexed read with no venue
	 * calls. This is what the console polls while a step runs, and a poll that
	 * quoted every market through the aggregator every few seconds would be a
	 * self-inflicted rate limit at the moment an operator most needs the venues
	 * answering.
	 */
	.get(
		"/vaults/:address/steps",
		async ({ admin, params, query }) => {
			await assertAdmin(admin);
			return {
				steps: await recentOperatorActions(params.address, chainOf(query.chainId)),
			};
		},
		{
			params: t.Object({ address: addressSchema }),
			query: t.Object({ chainId: t.Optional(t.String()) }),
		},
	)

	/**
	 * Run one step, and answer as soon as it has started.
	 *
	 * Not when it has finished: a spot sale is a swap and two confirmations, but a
	 * bridge is a venue withdrawal settling on Pacifica's schedule and then a
	 * Relay fill, which together can run for the better part of an hour. A request
	 * held open across that is one a proxy closes long before the money lands, and
	 * the operator would be left unable to tell a dropped request from a failed
	 * unwind. The row this returns is the handle; `/steps` is where it is watched.
	 */
	.post(
		"/vaults/:address/position/:step",
		async ({ admin, params, body }) => {
			await assertCanCreateVaults(admin);
			return {
				step: await startOperatorAction({
					address: params.address,
					chainId: body?.chainId,
					step: params.step,
					by: admin as string,
					reason: body?.reason,
				}),
			};
		},
		{
			params: t.Object({
				address: addressSchema,
				// Each step by name. An unknown one is a 422 rather than something
				// resolved to a default: there is no sensible default among "sell
				// every spot leg" and "send every dollar back to the vault".
				step: t.Union(OPERATOR_STEPS.map((step) => t.Literal(step))),
			}),
			body: t.Optional(
				t.Object({
					chainId: t.Optional(t.Number()),
					/** Why the vault is being wound down. Kept on the vault, not the step. */
					reason: t.Optional(t.String({ maxLength: 500 })),
				}),
			),
		},
	)

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
