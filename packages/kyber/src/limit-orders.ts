import type { Address, Hex } from "@lemon/core";
import { requestJson, UpstreamError } from "@lemon/core";
import type { KyberEnvelope, LimitOrder, LimitOrderInput, LimitOrderSignMessage } from "./types";

export const DEFAULT_LIMIT_ORDER_URL = "https://limit-order.kyberswap.com";

/**
 * KyberSwap limit orders: the maker signs an EIP-712 order off-chain (no gas),
 * it rests in KyberSwap's orderbook, and a taker settles it on-chain.
 *
 * Worth surfacing in the UI: a resting order only fills if a taker takes it.
 * On the thinner tokenized-stock pools an order can sit unfilled indefinitely,
 * which is normal behaviour for a limit order rather than a failure.
 */
export class KyberLimitOrderClient {
	private readonly baseUrl: string;
	private readonly chainId: string;
	private readonly clientId: string;
	private readonly timeoutMs: number;

	constructor(
		options: { baseUrl?: string; chainId?: number; clientId?: string; timeoutMs?: number } = {},
	) {
		this.baseUrl = options.baseUrl ?? DEFAULT_LIMIT_ORDER_URL;
		this.chainId = String(options.chainId ?? 8453);
		this.clientId = options.clientId ?? "lemon-markets";
		this.timeoutMs = options.timeoutMs ?? 20_000;
	}

	private get headers() {
		return { "x-client-id": this.clientId };
	}

	private unwrap<T>(response: KyberEnvelope<T>): T {
		if (response.code !== 0) {
			throw new UpstreamError("kyberswap-lo", 200, `kyberswap-lo: ${response.message}`, response);
		}
		return response.data;
	}

	/** The contract that must be approved to spend the maker asset. */
	async getContractAddress(): Promise<Address> {
		const res = await requestJson<KyberEnvelope<{ latest: Address }>>(
			"kyberswap-lo",
			this.baseUrl,
			"/read-ks/api/v1/configs/contract-address",
			{ query: { chainId: this.chainId }, headers: this.headers, timeoutMs: this.timeoutMs },
		);
		return this.unwrap(res).latest;
	}

	/**
	 * Total maker amount already committed to open orders for this token.
	 *
	 * Allowance must cover every open order, not just the new one — approving
	 * only the new order's amount silently invalidates the existing ones.
	 */
	async getActiveMakingAmount(maker: Address, makerAsset: Address): Promise<bigint> {
		const res = await requestJson<KyberEnvelope<string | { activeMakingAmount?: string }>>(
			"kyberswap-lo",
			this.baseUrl,
			"/read-ks/api/v1/orders/active-making-amount",
			{
				query: { chainId: this.chainId, maker, makerAsset },
				headers: this.headers,
				timeoutMs: this.timeoutMs,
			},
		);
		const data = this.unwrap(res);
		const raw = typeof data === "string" ? data : (data?.activeMakingAmount ?? "0");
		return BigInt(raw || "0");
	}

	async listOrders(params: {
		maker: Address;
		status?: "active" | "open" | "filled" | "cancelled" | "expired";
		makerAsset?: Address;
		takerAsset?: Address;
	}): Promise<LimitOrder[]> {
		const res = await requestJson<KyberEnvelope<{ orders?: LimitOrder[] } | LimitOrder[]>>(
			"kyberswap-lo",
			this.baseUrl,
			"/read-ks/api/v1/orders",
			{
				query: {
					chainId: this.chainId,
					maker: params.maker,
					status: params.status,
					makerAsset: params.makerAsset,
					takerAsset: params.takerAsset,
				},
				headers: this.headers,
				timeoutMs: this.timeoutMs,
			},
		);
		const data = this.unwrap(res);
		return Array.isArray(data) ? data : (data.orders ?? []);
	}

	/** Step 1 of placing an order: get the unsigned EIP-712 payload. */
	async buildSignMessage(input: Omit<LimitOrderInput, "chainId">): Promise<LimitOrderSignMessage> {
		const res = await requestJson<KyberEnvelope<LimitOrderSignMessage>>(
			"kyberswap-lo",
			this.baseUrl,
			"/write/api/v1/orders/sign-message",
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: { ...input, chainId: this.chainId },
			},
		);
		return this.unwrap(res);
	}

	/** Step 2: submit the signed order. `salt` comes from the sign-message payload. */
	async submitOrder(
		input: Omit<LimitOrderInput, "chainId">,
		salt: string,
		signature: Hex,
	): Promise<{ id: number }> {
		const res = await requestJson<KyberEnvelope<{ id: number }>>(
			"kyberswap-lo",
			this.baseUrl,
			"/write/api/v1/orders",
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: { ...input, chainId: this.chainId, salt, signature },
			},
		);
		return this.unwrap(res);
	}

	/** Gasless cancel, step 1: EIP-712 payload revoking the operator's co-signature. */
	async buildCancelMessage(maker: Address, orderIds: number[]): Promise<LimitOrderSignMessage> {
		const res = await requestJson<KyberEnvelope<LimitOrderSignMessage>>(
			"kyberswap-lo",
			this.baseUrl,
			"/write/api/v1/orders/cancel-sign",
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: { chainId: this.chainId, maker, orderIds },
			},
		);
		return this.unwrap(res);
	}

	/**
	 * Gasless cancel, step 2. Takes effect within ~5 minutes if the operator
	 * just co-signed an in-flight fill; use `buildHardCancelTx` when the order
	 * must stop being fillable immediately.
	 */
	async submitCancel(maker: Address, orderIds: number[], signature: Hex) {
		const res = await requestJson<KyberEnvelope<unknown>>(
			"kyberswap-lo",
			this.baseUrl,
			"/write/api/v1/orders/cancel",
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: { chainId: this.chainId, maker, orderIds, signature },
			},
		);
		return this.unwrap(res);
	}

	/** On-chain cancel: immediate, costs gas. */
	async buildHardCancelTx(maker: Address, orderIds: number[]) {
		const res = await requestJson<KyberEnvelope<{ encodedData: Hex; to?: Address }>>(
			"kyberswap-lo",
			this.baseUrl,
			"/read-ks/api/v1/encode/cancel-batch-orders",
			{
				method: "POST",
				headers: this.headers,
				timeoutMs: this.timeoutMs,
				body: { chainId: this.chainId, maker, orderIds },
			},
		);
		return this.unwrap(res);
	}
}
