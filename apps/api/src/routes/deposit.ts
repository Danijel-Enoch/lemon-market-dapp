import type { Address } from "@lemon/core";
import { isDatabaseConfigured, prisma } from "@lemon/db";
import { MissingRelayApiKeyError } from "@lemon/relay";
import { Elysia, t } from "elysia";
import { TtlCache } from "../cache";
import { clients } from "../config";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

/** Chain and currency list is stable; refetching per request is wasteful. */
const chainsCache = new TtlCache(() => clients.relay.getChains(), 10 * 60_000);

export const depositRoutes = new Elysia({ prefix: "/deposit" })
	/**
	 * Deposit availability.
	 *
	 * Reported explicitly because without an API key Relay does not fail — it
	 * returns an ordinary transaction quote with no deposit address, which
	 * would render as a mysteriously empty screen. Better to say why.
	 */
	.get("/status", () => ({
		available: clients.relay.hasApiKey,
		reason: clients.relay.hasApiKey
			? null
			: "Deposits need a Relay API key. Create one free at dashboard.relay.link and set RELAY_API_KEY.",
	}))

	.get("/chains", async () => {
		const chains = await chainsCache.get();
		return {
			chains: chains
				.filter((chain) => (chain.solverCurrencies?.length ?? 0) > 0)
				.map((chain) => ({
					id: chain.id,
					name: chain.displayName || chain.name,
					vmType: chain.vmType,
					currencies: chain.solverCurrencies ?? [],
				})),
		};
	})

	/** Issue a deposit address that bridges into USDC on Base. */
	.post(
		"/address",
		async ({ body, status }) => {
			let quote: Awaited<ReturnType<typeof clients.relay.createDepositAddress>>;
			try {
				quote = await clients.relay.createDepositAddress({
					recipient: body.recipient as Address,
					originChainId: body.originChainId,
					originCurrency: body.originCurrency,
					amount: body.amount,
				});
			} catch (error) {
				if (error instanceof MissingRelayApiKeyError) {
					return status(503, { error: error.message });
				}
				throw error;
			}

			// Persistence is best-effort: the deposit address is already valid and
			// usable, so a database outage must not block handing it to the user.
			if (isDatabaseConfigured()) {
				await prisma.depositIntent
					.create({
						data: {
							userAddress: body.recipient.toLowerCase(),
							requestId: quote.requestId,
							depositAddress: String(quote.depositAddress),
							originChainId: quote.originChainId,
							originCurrency: quote.originCurrency,
							originSymbol: quote.originSymbol,
							amount: quote.amount,
							amountFormatted: quote.amountFormatted,
						},
					})
					.catch(() => undefined);
			}

			return quote;
		},
		{
			body: t.Object({
				recipient: addressSchema,
				originChainId: t.Number(),
				originCurrency: t.String(),
				amount: t.String(),
			}),
		},
	)

	.get(
		"/status/:requestId",
		async ({ params }) => {
			const relayStatus = await clients.relay.getStatus(params.requestId);

			if (isDatabaseConfigured()) {
				const mapped = relayStatus.isComplete
					? "COMPLETE"
					: relayStatus.isFailed
						? "FAILED"
						: relayStatus.inTxHashes.length > 0
							? "DETECTED"
							: "PENDING";

				await prisma.depositIntent
					.update({
						where: { requestId: params.requestId },
						data: {
							status: mapped,
							inTxHash: relayStatus.inTxHashes[0],
							outTxHash: relayStatus.outTxHashes[0],
						},
					})
					.catch(() => undefined);
			}

			return relayStatus;
		},
		{ params: t.Object({ requestId: t.String() }) },
	)

	.get(
		"/history",
		async ({ query, status }) => {
			if (!isDatabaseConfigured()) return status(503, { error: "DATABASE_URL is not set." });
			return {
				deposits: await prisma.depositIntent.findMany({
					where: { userAddress: query.user.toLowerCase() },
					orderBy: { createdAt: "desc" },
					take: 50,
				}),
			};
		},
		{ query: t.Object({ user: addressSchema }) },
	);
