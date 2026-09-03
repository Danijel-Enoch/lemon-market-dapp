import {
	buildSignedRequest,
	type Json,
	type OperationType,
	type SignedRequest,
	type Signer,
} from "./signing";
import {
	type PacificaAccountInfo,
	type PacificaBridgeAsset,
	type PacificaBuilderApproval,
	type PacificaCandle,
	type PacificaEnvelope,
	PacificaError,
	type PacificaMarketInfo,
	type PacificaOpenOrder,
	type PacificaOrderbook,
	type PacificaOrderReceipt,
	type PacificaPosition,
	type PacificaPrice,
	type Side,
	type TimeInForce,
} from "./types";

export const PACIFICA_MAINNET = "https://api.pacifica.fi/api/v1";
export const PACIFICA_TESTNET = "https://test-api.pacifica.fi/api/v1";

export interface PacificaClientOptions {
	baseUrl?: string;
	/** Milliseconds before an in-flight request is abandoned. */
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

/**
 * Pacifica REST client.
 *
 * Read endpoints are plain GETs. Mutating endpoints are signed — see
 * `./signing` — and take a `Signer`, which is either a locally held agent key
 * or the NEAR MPC network standing in for the account's own key. The client
 * never holds key material itself, so the same instance serves both.
 */
export class PacificaClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(options: PacificaClientOptions = {}) {
		this.baseUrl = (options.baseUrl ?? PACIFICA_MAINNET).replace(/\/$/, "");
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	/**
	 * A Pacifica 200 can still carry `success: false`, so the envelope is checked
	 * as well as the status — otherwise a rejected order reads as a success with
	 * undefined data.
	 */
	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		let response: Response;
		try {
			response = await this.fetchImpl(`${this.baseUrl}${path}`, {
				...init,
				signal: controller.signal,
				headers: {
					accept: "application/json",
					...(init?.body ? { "content-type": "application/json" } : {}),
					...init?.headers,
				},
			});
		} catch (cause) {
			if (controller.signal.aborted) {
				throw new PacificaError(0, `Pacifica request timed out after ${this.timeoutMs}ms`);
			}
			throw new PacificaError(0, `Pacifica request failed: ${(cause as Error).message}`);
		} finally {
			clearTimeout(timer);
		}

		const text = await response.text();
		let envelope: PacificaEnvelope<T> | undefined;
		try {
			envelope = text ? (JSON.parse(text) as PacificaEnvelope<T>) : undefined;
		} catch {
			throw new PacificaError(response.status, `Pacifica returned non-JSON: ${text.slice(0, 200)}`);
		}

		if (!response.ok) {
			throw new PacificaError(
				response.status,
				envelope?.error ?? `Pacifica request failed (${response.status})`,
				envelope?.code ?? null,
			);
		}
		if (!envelope?.success) {
			throw new PacificaError(
				response.status,
				envelope?.error ?? "Pacifica rejected the request",
				envelope?.code ?? null,
			);
		}
		return envelope.data;
	}

	private get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined && value !== "") search.set(key, String(value));
		}
		const suffix = search.size > 0 ? `?${search}` : "";
		return this.request<T>(`${path}${suffix}`);
	}

	private async post<T>(path: string, body: SignedRequest): Promise<T> {
		return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
	}

	/* ------------------------------------------------------------ market data */

	/** Every listed market and its trading constraints. */
	markets(): Promise<PacificaMarketInfo[]> {
		return this.get<PacificaMarketInfo[]>("/info");
	}

	/** Mark, oracle, funding, open interest and 24h stats for every market. */
	prices(): Promise<PacificaPrice[]> {
		return this.get<PacificaPrice[]>("/info/prices");
	}

	orderbook(symbol: string, aggLevel = 1): Promise<PacificaOrderbook> {
		return this.get<PacificaOrderbook>("/book", { symbol, agg_level: aggLevel });
	}

	/** `interval` is Pacifica's granularity string, e.g. "1m", "1h", "1d". */
	candles(
		symbol: string,
		interval: string,
		startTime: number,
		endTime?: number,
	): Promise<PacificaCandle[]> {
		return this.get<PacificaCandle[]>("/kline", {
			symbol,
			interval,
			start_time: startTime,
			end_time: endTime,
		});
	}

	/** Deposit minimums and the custody program for each supported asset. */
	bridgeInfo(): Promise<PacificaBridgeAsset[]> {
		return this.get<PacificaBridgeAsset[]>("/spot_assets/bridge/info");
	}

	/* ---------------------------------------------------------------- account */

	accountInfo(account: string): Promise<PacificaAccountInfo> {
		return this.get<PacificaAccountInfo>("/account", { account });
	}

	positions(account: string): Promise<PacificaPosition[]> {
		return this.get<PacificaPosition[]>("/positions", { account });
	}

	openOrders(account: string): Promise<PacificaOpenOrder[]> {
		return this.get<PacificaOpenOrder[]>("/orders", { account });
	}

	/**
	 * Builder codes this account has approved, and the fee ceiling it set.
	 *
	 * Worth reading before attaching a code: Pacifica *rejects* an order whose
	 * builder fee exceeds the user's approved `max_fee_rate`, rather than
	 * dropping the attribution and filling anyway. An unapproved code therefore
	 * breaks trading rather than merely forgoing a fee.
	 */
	builderCodeApprovals(account: string): Promise<PacificaBuilderApproval[]> {
		return this.get<PacificaBuilderApproval[]>("/account/builder_codes/approvals", { account });
	}

	/* ------------------------------------------------------- signed mutations */

	/** Shared shape for every signed call: build the body, then POST it. */
	private async signed<T>(
		path: string,
		sign: Signer,
		type: OperationType,
		account: string,
		data: Json,
		agentWallet?: string | null,
	): Promise<T> {
		const body = await buildSignedRequest(sign, { account, type, data, agentWallet });
		return this.post<T>(path, body);
	}

	/**
	 * Authorise an agent key to act for this account.
	 *
	 * This is the one call that must be signed by the account's own key — i.e.
	 * through NEAR MPC. Everything afterwards can be signed locally by the agent,
	 * which keeps ordinary trading off the MPC path entirely.
	 */
	bindAgentWallet(
		sign: Signer,
		account: string,
		agentPublicKey: string,
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>("/agent/bind", sign, "bind_agent_wallet", account, {
			agent_wallet: agentPublicKey,
		});
	}

	/**
	 * Let a builder charge a fee on this account's orders.
	 *
	 * `maxFeeRate` is the user's ceiling, as a decimal fraction — "0.001" is
	 * 0.1%. It must be at least the builder's registered rate or every attributed
	 * order is rejected, so it is set with headroom rather than exactly.
	 *
	 * Signed by the account key, not an agent: an agent key belongs to the
	 * builder's own server, and letting it approve the builder's fee would make
	 * the user's consent a formality.
	 */
	approveBuilderCode(
		sign: Signer,
		params: { account: string; builderCode: string; maxFeeRate: string },
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>(
			"/account/builder_codes/approve",
			sign,
			"approve_builder_code",
			params.account,
			{ builder_code: params.builderCode, max_fee_rate: params.maxFeeRate },
		);
	}

	/** Withdraw a builder's permission to charge this account. */
	revokeBuilderCode(
		sign: Signer,
		params: { account: string; builderCode: string },
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>(
			"/account/builder_codes/revoke",
			sign,
			"revoke_builder_code",
			params.account,
			{ builder_code: params.builderCode },
		);
	}

	createMarketOrder(
		sign: Signer,
		params: {
			account: string;
			agentWallet?: string | null;
			symbol: string;
			side: Side;
			amount: string;
			/**
			 * Maximum slippage, as a percentage: "0.5" means 0.5%, not 50% and
			 * not 0.005. Pacifica reads this figure literally, so a caller that
			 * passes a fraction asks for a hundredth of what they intended and
			 * watches orders fail to fill.
			 */
			slippagePercent: string;
			reduceOnly?: boolean;
			clientOrderId?: string;
			/**
			 * Builder code to attribute the order to. Only send one the account
			 * has approved — an unapproved code is a rejected order, not an
			 * unattributed fill.
			 */
			builderCode?: string;
		},
	): Promise<PacificaOrderReceipt> {
		return this.signed<PacificaOrderReceipt>(
			"/orders/create_market",
			sign,
			"create_market_order",
			params.account,
			{
				symbol: params.symbol,
				side: params.side,
				amount: params.amount,
				slippage_percent: params.slippagePercent,
				reduce_only: params.reduceOnly ?? false,
				...(params.clientOrderId ? { client_order_id: params.clientOrderId } : {}),
				...(params.builderCode ? { builder_code: params.builderCode } : {}),
			},
			params.agentWallet,
		);
	}

	createLimitOrder(
		sign: Signer,
		params: {
			account: string;
			agentWallet?: string | null;
			symbol: string;
			side: Side;
			amount: string;
			price: string;
			tif?: TimeInForce;
			reduceOnly?: boolean;
			clientOrderId?: string;
			/** See `createMarketOrder`: approved codes only. */
			builderCode?: string;
		},
	): Promise<PacificaOrderReceipt> {
		return this.signed<PacificaOrderReceipt>(
			"/orders/create",
			sign,
			"create_order",
			params.account,
			{
				symbol: params.symbol,
				side: params.side,
				amount: params.amount,
				price: params.price,
				tif: params.tif ?? "GTC",
				reduce_only: params.reduceOnly ?? false,
				...(params.clientOrderId ? { client_order_id: params.clientOrderId } : {}),
				...(params.builderCode ? { builder_code: params.builderCode } : {}),
			},
			params.agentWallet,
		);
	}

	cancelOrder(
		sign: Signer,
		params: {
			account: string;
			agentWallet?: string | null;
			symbol: string;
			orderId: number;
		},
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>(
			"/orders/cancel",
			sign,
			"cancel_order",
			params.account,
			{ symbol: params.symbol, order_id: params.orderId },
			params.agentWallet,
		);
	}

	updateLeverage(
		sign: Signer,
		params: {
			account: string;
			agentWallet?: string | null;
			symbol: string;
			leverage: number;
		},
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>(
			"/account/leverage",
			sign,
			"update_leverage",
			params.account,
			{ symbol: params.symbol, leverage: params.leverage },
			params.agentWallet,
		);
	}

	/**
	 * Move USDC out of the Pacifica account.
	 *
	 * Must be signed by the account key (MPC), not an agent — an agent that could
	 * withdraw would make the local key as sensitive as the account itself.
	 */
	requestWithdrawal(
		sign: Signer,
		params: { account: string; amount: string },
	): Promise<{ success: boolean }> {
		return this.signed<{ success: boolean }>(
			"/account/withdraw",
			sign,
			"withdraw",
			params.account,
			{ amount: params.amount },
		);
	}
}
