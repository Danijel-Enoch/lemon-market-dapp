import type { Address, Market } from "@lemon/core";
import { requestJson } from "@lemon/core";
import { selectTradableMarkets } from "./markets";
import { normalizePositions, type SymbolResolver } from "./positions";
import type {
	AvantisAddresses,
	AvantisEnvelope,
	CloseTradeParams,
	OpenTradeParams,
	RawIntent,
	RawPair,
	RawPositionsData,
	RawUnsignedTx,
} from "./types";

export const DEFAULT_TX_BUILDER_URL = "https://tx-builder.avantisfi.com";
export const DEFAULT_BATCHED_MARKET_URL = "https://prod-api.avantisfi.com/batched-market";
export const TESTNET_TX_BUILDER_URL = "https://tx-builder-testnet.avantisfi.com";
export const TESTNET_BATCHED_MARKET_URL = "https://staging-api.avantisfi.com/batched-market";

export interface AvantisClientOptions {
	txBuilderUrl?: string;
	batchedMarketUrl?: string;
	timeoutMs?: number;
}

/**
 * Client for the Avantis v2 tx-builder.
 *
 * Deliberately does not sign anything: every method returns either an unsigned
 * transaction or a ready-to-sign EIP-712 payload, which the browser wallet
 * handles. This is why we integrate the REST API rather than the published
 * `@avantis/sdk` TypeScript package — that SDK is v1 and requires a raw private
 * key, which a dapp must never hold.
 */
export class AvantisClient {
	private readonly txBuilderUrl: string;
	private readonly batchedMarketUrl: string;
	private readonly timeoutMs: number;

	constructor(options: AvantisClientOptions = {}) {
		this.txBuilderUrl = options.txBuilderUrl ?? DEFAULT_TX_BUILDER_URL;
		this.batchedMarketUrl = options.batchedMarketUrl ?? DEFAULT_BATCHED_MARKET_URL;
		this.timeoutMs = options.timeoutMs ?? 20_000;
	}

	private get<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
		return requestJson<T>("avantis", this.txBuilderUrl, path, {
			query,
			timeoutMs: this.timeoutMs,
		});
	}

	private post<T>(path: string, body: unknown) {
		return requestJson<T>("avantis", this.txBuilderUrl, path, {
			method: "POST",
			body,
			timeoutMs: this.timeoutMs,
		});
	}

	/** Protocol contract addresses for the chain this deployment targets. */
	async getAddresses(): Promise<AvantisAddresses> {
		const res =
			await this.get<AvantisEnvelope<{ chainId: number; addresses: AvantisAddresses }>>(
				"/addresses",
			);
		return res.data.addresses;
	}

	/** Raw pair catalog. Prefer `getMarkets()` unless you need crypto pairs too. */
	async getPairs(): Promise<RawPair[]> {
		const res = await this.get<AvantisEnvelope<RawPair[]>>("/v2/pairs");
		return res.data;
	}

	/** Listed equity and FX markets only — the universe this app trades. */
	async getMarkets(): Promise<Market[]> {
		return selectTradableMarkets(await this.getPairs());
	}

	/**
	 * `resolveSymbol` labels positions without a second catalog fetch; callers
	 * that already hold the market list should pass it.
	 */
	async getPositions(trader: Address, resolveSymbol?: SymbolResolver) {
		const res = await this.get<AvantisEnvelope<RawPositionsData>>("/v2/positions", { trader });
		return normalizePositions(res.data, resolveSymbol);
	}

	async getAllowance(trader: Address, spender?: Address) {
		return this.get<AvantisEnvelope<{ allowance: string; balance: string }>>("/v2/allowance", {
			trader,
			spender,
		});
	}

	/** One-time USDC approval to TradingStorage, required before any trade. */
	async buildApprove(params: { trader: Address; amountUsdc?: number; spender?: Address }) {
		const res = await this.post<AvantisEnvelope<RawUnsignedTx>>("/v2/token/approve", params);
		return res.data;
	}

	/** Random unused nonce, verified against the on-chain bitmap. */
	async suggestNonce(trader: Address): Promise<string> {
		const res = await this.get<AvantisEnvelope<{ nonce: string }>>("/v2/nonce", { trader });
		return res.data.nonce;
	}

	// --- Direct transactions (wallet pays gas) ------------------------------

	async buildOpenTrade(params: OpenTradeParams & { executionFeeWei?: string }) {
		const res = await this.post<AvantisEnvelope<RawUnsignedTx>>("/v2/trade/open", params);
		return res.data;
	}

	async buildCloseTrade(params: CloseTradeParams & { executionFeeWei?: string }) {
		const res = await this.post<AvantisEnvelope<RawUnsignedTx>>("/v2/trade/close", params);
		return res.data;
	}

	/** Edit a resting limit / stop-limit order's trigger price, slippage or TP/SL. */
	async buildUpdateLimitOrder(params: {
		trader: Address;
		pairIndex: number;
		index: number;
		openPrice?: number;
		slippagePercent?: number;
		takeProfit?: number;
		stopLoss?: number;
	}) {
		const res = await this.post<AvantisEnvelope<RawUnsignedTx>>("/v2/limit/update", params);
		return res.data;
	}

	/** Cancel a resting limit order; escrowed collateral is refunded. */
	async buildCancelLimitOrder(params: { trader: Address; pairIndex: number; index: number }) {
		const res = await this.post<AvantisEnvelope<RawUnsignedTx>>("/v2/limit/cancel", params);
		return res.data;
	}

	// --- Gasless intents (operator pays gas) -------------------------------

	async buildOpenIntent(params: OpenTradeParams & { nonce?: string; deadlineMs?: number }) {
		const res = await this.post<AvantisEnvelope<RawIntent>>("/v2/intents/open", params);
		return res.data;
	}

	async buildCloseIntent(
		params: CloseTradeParams & { nonce?: string; deadlineMs?: number; openTimestamp?: number },
	) {
		const res = await this.post<AvantisEnvelope<RawIntent>>("/v2/intents/close", params);
		return res.data;
	}

	async buildTpSlIntent(params: {
		trader: Address;
		pairIndex: number;
		index: number;
		takeProfit?: number;
		stopLoss?: number;
		nonce?: string;
	}) {
		const res = await this.post<AvantisEnvelope<RawIntent>>("/v2/intents/tpsl-update", params);
		return res.data;
	}

	/**
	 * Submit a signed intent to the batched-market service.
	 *
	 * The response is an SSE stream of the fill lifecycle. We read it to
	 * completion and return the terminal event rather than exposing the stream,
	 * because callers only act on the outcome. `onEvent` gets each event for
	 * progress UI.
	 */
	async submitIntent(params: {
		orderType: number;
		encodedIntent: string;
		signature: string;
		onEvent?: (event: { name: string; payload: unknown }) => void;
		signal?: AbortSignal;
	}): Promise<{
		trackingId?: string;
		status: string;
		events: { name: string; payload: unknown }[];
	}> {
		const response = await fetch(`${this.batchedMarketUrl}/market/execute-batched`, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({
				orderType: params.orderType,
				erc712: { userIntent: params.encodedIntent, userSignature: params.signature },
			}),
			signal: params.signal,
		});

		if (!response.ok || !response.body) {
			const detail = await response.text().catch(() => "");
			throw new Error(`avantis batched-market: HTTP ${response.status} ${detail.slice(0, 300)}`);
		}

		const events: { name: string; payload: unknown }[] = [];
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let trackingId: string | undefined;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// SSE frames are separated by a blank line.
			const frames = buffer.split("\n\n");
			buffer = frames.pop() ?? "";

			for (const frame of frames) {
				const event = parseSseFrame(frame);
				if (!event) continue;
				events.push(event);
				params.onEvent?.(event);
				const payload = event.payload as { trackingId?: string } | undefined;
				if (payload?.trackingId) trackingId = payload.trackingId;
			}
		}

		const terminal = events.at(-1);
		return { trackingId, status: terminal?.name ?? "unknown", events };
	}

	/** Replay a submission's lifecycle events, e.g. after a dropped connection. */
	async getTrackingStatus(trackingId: string, afterSeq = 0) {
		return requestJson<unknown>(
			"avantis",
			this.batchedMarketUrl,
			`/tracking-id/${trackingId}/status`,
			{ query: { afterSeq }, timeoutMs: this.timeoutMs },
		);
	}
}

function parseSseFrame(frame: string): { name: string; payload: unknown } | null {
	let name = "message";
	const dataLines: string[] = [];

	for (const line of frame.split("\n")) {
		if (line.startsWith("event:")) name = line.slice(6).trim();
		else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
	}
	if (dataLines.length === 0) return null;

	const raw = dataLines.join("\n");
	try {
		return { name, payload: JSON.parse(raw) };
	} catch {
		return { name, payload: raw };
	}
}
