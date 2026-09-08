import { describe, expect, test } from "bun:test";
import { PacificaClient } from "./client";
import { canonicalMessage, generateKeypair, localSigner, verifyMessage } from "./signing";
import { isAccountNotFound, PacificaError } from "./types";

/** Serves one canned envelope and records what it was asked for. */
function stubFetch(payload: unknown, status = 200) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const impl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return new Response(JSON.stringify(payload), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return { impl, calls };
}

const ok = <T>(data: T) => ({ success: true, data, error: null, code: null });

describe("read endpoints", () => {
	test("unwraps the envelope and returns data", async () => {
		const { impl, calls } = stubFetch(ok([{ symbol: "SOL" }]));
		const client = new PacificaClient({ fetchImpl: impl });

		expect(await client.markets()).toEqual([{ symbol: "SOL" }] as never);
		expect(calls[0].url).toBe("https://api.pacifica.fi/api/v1/info");
	});

	test("builds query strings and drops undefined params", async () => {
		const { impl, calls } = stubFetch(ok([]));
		const client = new PacificaClient({ fetchImpl: impl });

		await client.candles("BTC", "1h", 1000);
		const url = new URL(calls[0].url);
		expect(url.pathname).toBe("/api/v1/kline");
		expect(url.searchParams.get("symbol")).toBe("BTC");
		expect(url.searchParams.get("interval")).toBe("1h");
		expect(url.searchParams.get("start_time")).toBe("1000");
		expect(url.searchParams.has("end_time")).toBe(false);
	});

	test("honours a custom base URL", async () => {
		const { impl, calls } = stubFetch(ok([]));
		await new PacificaClient({ fetchImpl: impl, baseUrl: "https://test-api.x/api/v1/" }).prices();
		expect(calls[0].url).toBe("https://test-api.x/api/v1/info/prices");
	});
});

describe("error handling", () => {
	test("throws on a non-2xx and carries the message through", async () => {
		const { impl } = stubFetch(
			{ success: false, data: null, error: "bad symbol", code: 4001 },
			400,
		);
		const client = new PacificaClient({ fetchImpl: impl });

		expect(client.markets()).rejects.toThrow(/bad symbol/);
	});

	/**
	 * The case worth guarding: HTTP 200 with success:false. Treating that as a
	 * success would hand callers `undefined` data and hide a rejected order.
	 */
	test("throws when a 200 reports success:false", async () => {
		const { impl } = stubFetch({
			success: false,
			data: null,
			error: "insufficient margin",
			code: 7,
		});
		const client = new PacificaClient({ fetchImpl: impl });

		expect(client.markets()).rejects.toThrow(/insufficient margin/);
	});

	test("surfaces the status and code on the error", async () => {
		const { impl } = stubFetch({ success: false, data: null, error: "nope", code: 42 }, 401);
		try {
			await new PacificaClient({ fetchImpl: impl }).markets();
			throw new Error("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(PacificaError);
			expect((error as PacificaError).status).toBe(401);
			expect((error as PacificaError).code).toBe(42);
		}
	});

	test("reports non-JSON bodies rather than throwing a parse error", async () => {
		const impl = (async () =>
			new Response("<html>gateway</html>", { status: 502 })) as unknown as typeof fetch;
		expect(new PacificaClient({ fetchImpl: impl }).markets()).rejects.toThrow(/non-JSON/);
	});

	/**
	 * "Account not found" is a state, not an outage: Pacifica has no registration
	 * call, so this is what every account endpoint answers for a wallet that has
	 * not yet deposited. Callers that cannot tell it apart from a real failure
	 * refuse to make the deposit that would create the account.
	 */
	test("an unregistered account is recognisable, whatever the status", async () => {
		for (const status of [404, 422]) {
			const { impl } = stubFetch(
				{ success: false, data: null, error: "Account not found", code: null },
				status,
			);
			try {
				await new PacificaClient({ fetchImpl: impl }).accountInfo("SoLanaAgent");
				throw new Error("should have thrown");
			} catch (error) {
				expect(isAccountNotFound(error)).toBe(true);
			}
		}
	});

	test("an ordinary rejection is not mistaken for an unregistered account", async () => {
		const { impl } = stubFetch(
			{ success: false, data: null, error: "insufficient margin", code: 7 },
			400,
		);
		try {
			await new PacificaClient({ fetchImpl: impl }).accountInfo("SoLanaAgent");
			throw new Error("should have thrown");
		} catch (error) {
			expect(isAccountNotFound(error)).toBe(false);
		}
	});

	test("times out instead of hanging", async () => {
		const impl = (async (_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
				);
			})) as unknown as typeof fetch;

		expect(new PacificaClient({ fetchImpl: impl, timeoutMs: 40 }).markets()).rejects.toThrow(
			/timed out/,
		);
	});
});

describe("signed mutations", () => {
	const account = generateKeypair();
	const agent = generateKeypair();

	test("market order posts a flat, correctly signed body", async () => {
		const { impl, calls } = stubFetch(ok({ order_id: 99 }));
		const client = new PacificaClient({ fetchImpl: impl });

		const receipt = await client.createMarketOrder(localSigner(agent.secretKey), {
			account: account.publicKey,
			agentWallet: agent.publicKey,
			symbol: "BTC",
			side: "bid",
			amount: "0.1",
			slippagePercent: "0.01",
		});

		expect(receipt.order_id).toBe(99);
		expect(calls[0].url).toBe("https://api.pacifica.fi/api/v1/orders/create_market");
		expect(calls[0].init?.method).toBe("POST");

		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.account).toBe(account.publicKey);
		expect(body.agent_wallet).toBe(agent.publicKey);
		expect(body.symbol).toBe("BTC");
		expect(body.reduce_only).toBe(false);
		// Flat on the wire — the payload is not nested under `data`.
		expect(body.data).toBeUndefined();

		// The signature must verify over the nested canonical form.
		const message = canonicalMessage(
			{
				timestamp: body.timestamp,
				expiry_window: body.expiry_window,
				type: "create_market_order",
			},
			{
				symbol: "BTC",
				side: "bid",
				amount: "0.1",
				slippage_percent: "0.01",
				reduce_only: false,
			},
		);
		expect(verifyMessage(message, body.signature, agent.publicKey)).toBe(true);
	});

	/**
	 * Builder attribution rides inside the signed payload, not beside it.
	 *
	 * If `builder_code` were added to the request after signing, Pacifica would
	 * rebuild a different canonical message and reject the signature — so this
	 * asserts the code is part of what was signed, not merely present on the wire.
	 */
	test("a builder code is signed over, not appended after the fact", async () => {
		const { impl, calls } = stubFetch(ok({ order_id: 7 }));

		await new PacificaClient({ fetchImpl: impl }).createMarketOrder(localSigner(agent.secretKey), {
			account: account.publicKey,
			agentWallet: agent.publicKey,
			symbol: "BTC",
			side: "bid",
			amount: "0.1",
			slippagePercent: "0.5",
			builderCode: "lemon01",
		});

		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.builder_code).toBe("lemon01");

		const message = canonicalMessage(
			{
				timestamp: body.timestamp,
				expiry_window: body.expiry_window,
				type: "create_market_order",
			},
			{
				symbol: "BTC",
				side: "bid",
				amount: "0.1",
				slippage_percent: "0.5",
				reduce_only: false,
				builder_code: "lemon01",
			},
		);
		expect(verifyMessage(message, body.signature, agent.publicKey)).toBe(true);
	});

	test("no builder code means no builder_code field at all", async () => {
		const { impl, calls } = stubFetch(ok({ order_id: 8 }));

		await new PacificaClient({ fetchImpl: impl }).createMarketOrder(localSigner(agent.secretKey), {
			account: account.publicKey,
			symbol: "BTC",
			side: "bid",
			amount: "0.1",
			slippagePercent: "0.5",
		});

		// Absent, not null or empty: an unrecognised code is a rejected order.
		expect("builder_code" in JSON.parse(String(calls[0].init?.body))).toBe(false);
	});

	test("a limit order carries its builder code too", async () => {
		const { impl, calls } = stubFetch(ok({ order_id: 9 }));

		await new PacificaClient({ fetchImpl: impl }).createLimitOrder(localSigner(agent.secretKey), {
			account: account.publicKey,
			agentWallet: agent.publicKey,
			symbol: "SOL",
			side: "ask",
			amount: "1",
			price: "100",
			builderCode: "lemon01",
		});

		expect(JSON.parse(String(calls[0].init?.body)).builder_code).toBe("lemon01");
	});

	/**
	 * Approving a builder code is signed by the account key, so no agent wallet
	 * appears on it — an agent key belongs to the builder's own server, and
	 * letting it approve the builder's fee would make consent a formality.
	 */
	test("approving a builder code carries the code, the ceiling and no agent", async () => {
		const { impl, calls } = stubFetch(ok({ success: true }));

		await new PacificaClient({ fetchImpl: impl }).approveBuilderCode(
			localSigner(account.secretKey),
			{ account: account.publicKey, builderCode: "lemon01", maxFeeRate: "0.001" },
		);

		expect(calls[0].url).toBe("https://api.pacifica.fi/api/v1/account/builder_codes/approve");
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.builder_code).toBe("lemon01");
		expect(body.max_fee_rate).toBe("0.001");
		expect(body.agent_wallet).toBeNull();

		const message = canonicalMessage(
			{
				timestamp: body.timestamp,
				expiry_window: body.expiry_window,
				type: "approve_builder_code",
			},
			{ builder_code: "lemon01", max_fee_rate: "0.001" },
		);
		expect(verifyMessage(message, body.signature, account.publicKey)).toBe(true);
	});

	test("revoking sends only the code", async () => {
		const { impl, calls } = stubFetch(ok({ success: true }));

		await new PacificaClient({ fetchImpl: impl }).revokeBuilderCode(
			localSigner(account.secretKey),
			{ account: account.publicKey, builderCode: "lemon01" },
		);

		expect(calls[0].url).toBe("https://api.pacifica.fi/api/v1/account/builder_codes/revoke");
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.builder_code).toBe("lemon01");
		expect(body.max_fee_rate).toBeUndefined();
	});

	test("limit order defaults to GTC and omits an absent client id", async () => {
		const { impl, calls } = stubFetch(ok({ order_id: 1 }));
		await new PacificaClient({ fetchImpl: impl }).createLimitOrder(localSigner(account.secretKey), {
			account: account.publicKey,
			symbol: "SOL",
			side: "ask",
			amount: "1",
			price: "200",
		});

		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.tif).toBe("GTC");
		expect(body.client_order_id).toBeUndefined();
		expect(body.agent_wallet).toBe(null);
	});

	test("binding an agent is signed by the account key itself", async () => {
		const { impl, calls } = stubFetch(ok({ success: true }));
		await new PacificaClient({ fetchImpl: impl }).bindAgentWallet(
			localSigner(account.secretKey),
			account.publicKey,
			agent.publicKey,
		);

		const body = JSON.parse(String(calls[0].init?.body));
		expect(calls[0].url).toContain("/agent/bind");
		expect(body.agent_wallet).toBe(agent.publicKey);

		const message = canonicalMessage(
			{ timestamp: body.timestamp, expiry_window: body.expiry_window, type: "bind_agent_wallet" },
			{ agent_wallet: agent.publicKey },
		);
		expect(verifyMessage(message, body.signature, account.publicKey)).toBe(true);
	});

	/**
	 * An agent key that could withdraw would be as sensitive as the account key,
	 * which defeats the point of having one.
	 */
	test("withdrawal never carries an agent wallet", async () => {
		const { impl, calls } = stubFetch(ok({ success: true }));
		await new PacificaClient({ fetchImpl: impl }).requestWithdrawal(
			localSigner(account.secretKey),
			{ account: account.publicKey, amount: "25" },
		);

		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.agent_wallet).toBe(null);
		expect(body.amount).toBe("25");
	});

	test("accepts an async signer, as the MPC path requires", async () => {
		const { impl, calls } = stubFetch(ok({ success: true }));
		const remote = async (message: string) => localSigner(account.secretKey)(message);

		await new PacificaClient({ fetchImpl: impl }).updateLeverage(remote, {
			account: account.publicKey,
			symbol: "BTC",
			leverage: 5,
		});

		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.leverage).toBe(5);
	});
});
