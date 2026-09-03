import { describe, expect, test } from "bun:test";
import { PacificaClient } from "./client";
import { canonicalMessage, generateKeypair, localSigner, verifyMessage } from "./signing";
import { PacificaError } from "./types";

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
