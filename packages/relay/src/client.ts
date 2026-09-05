import type { Address } from "@lemon/core";
import { BASE_CHAIN_ID, requestJson, USDC_ADDRESS, ZERO_ADDRESS } from "@lemon/core";

export const DEFAULT_RELAY_URL = "https://api.relay.link";

/**
 * Relay's identifier for Solana mainnet.
 *
 * Relay numbers non-EVM chains in the same space as EVM chain ids, so this is
 * not an EVM chain id and must never be handed to a wallet or an RPC.
 */
export const SOLANA_CHAIN_ID = 792703809;

/** USDC's SPL mint, which is what Relay calls the currency on Solana. */
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface RelayChain {
	id: number;
	name: string;
	displayName: string;
	vmType?: string;
	solverCurrencies?: { symbol: string; address: string; decimals: number }[];
}

export interface DepositQuote {
	requestId: string;
	depositAddress: Address | string;
	/** Amount to send, in the origin currency's base units. */
	amount: string;
	amountFormatted: string;
	originChainId: number;
	originCurrency: string;
	originSymbol: string;
	destinationAmountFormatted: string;
	/** Endpoint to poll for fill status. */
	statusEndpoint: string;
}

export interface DepositStatus {
	status: string;
	requestId: string;
	inTxHashes: string[];
	outTxHashes: string[];
	/** True once funds have landed on the destination chain. */
	isComplete: boolean;
	isFailed: boolean;
}

interface RawQuoteResponse {
	requestId: string;
	steps?: {
		id: string;
		kind: string;
		items?: {
			depositAddress?: string;
			depositAddressId?: string;
			check?: { endpoint?: string };
			data?: unknown;
		}[];
	}[];
	details?: {
		currencyIn?: {
			currency?: { chainId: number; address: string; symbol: string };
			amount?: string;
			amountFormatted?: string;
		};
		currencyOut?: { amountFormatted?: string };
	};
}

export class MissingRelayApiKeyError extends Error {
	constructor() {
		super(
			"Relay deposit addresses require an API key. Set RELAY_API_KEY (free, self-serve at dashboard.relay.link).",
		);
		this.name = "MissingRelayApiKeyError";
	}
}

/**
 * Client for Relay, used to fund a Base account from any supported chain.
 *
 * Deposit addresses specifically require an API key. Without one Relay does not
 * error — it quietly returns an ordinary transaction step instead of a deposit
 * address, which would surface as a confusing empty box in the UI. The client
 * therefore fails loudly up front rather than degrading.
 */
export class RelayClient {
	private readonly baseUrl: string;
	private readonly apiKey?: string;
	private readonly timeoutMs: number;

	constructor(options: { baseUrl?: string; apiKey?: string; timeoutMs?: number } = {}) {
		this.baseUrl = options.baseUrl ?? DEFAULT_RELAY_URL;
		this.apiKey = options.apiKey?.trim() || undefined;
		this.timeoutMs = options.timeoutMs ?? 25_000;
	}

	get hasApiKey(): boolean {
		return Boolean(this.apiKey);
	}

	private get headers(): Record<string, string> {
		return this.apiKey ? { "x-api-key": this.apiKey } : {};
	}

	async getChains(): Promise<RelayChain[]> {
		const res = await requestJson<{ chains: RelayChain[] }>("relay", this.baseUrl, "/chains", {
			headers: this.headers,
			timeoutMs: this.timeoutMs,
		});
		return res.chains ?? [];
	}

	/**
	 * Request a deposit address that bridges into USDC.
	 *
	 * Defaults to USDC on Base, which is where the app's spot and perp venues
	 * settle. `destinationChainId` opens the same machinery up to Solana, for
	 * funding a Pacifica account — the recipient there is a base58 address, not
	 * an EVM one, which is why this takes a plain string.
	 *
	 * `refundTo` defaults to the origin chain's native-currency zero address,
	 * which is Relay's opt-in for automatic refunds back to whoever sent the
	 * funds. Omitting it disables refunds entirely — there is no fallback — so
	 * a failed bridge would strand the deposit.
	 */
	async createDepositAddress(params: {
		recipient: Address | string;
		/**
		 * Who is sending, on the origin chain. Defaults to the recipient, which
		 * is right for a same-VM bridge and wrong for a cross-VM one — an EVM
		 * wallet funding a Solana address is not its own sender.
		 */
		sender?: Address | string;
		originChainId: number;
		originCurrency: string;
		amount: string;
		destinationChainId?: number;
		destinationCurrency?: string;
		/**
		 * Where a failed bridge sends the funds back to. Must be an address on
		 * the *origin* chain — defaulting it to the recipient would be wrong the
		 * moment the two chains differ.
		 */
		refundTo?: string;
		strict?: boolean;
	}): Promise<DepositQuote> {
		if (!this.apiKey) throw new MissingRelayApiKeyError();

		const response = await requestJson<RawQuoteResponse>("relay", this.baseUrl, "/quote/v2", {
			method: "POST",
			headers: this.headers,
			timeoutMs: this.timeoutMs,
			body: {
				user: params.sender ?? params.recipient,
				recipient: params.recipient,
				originChainId: params.originChainId,
				destinationChainId: params.destinationChainId ?? BASE_CHAIN_ID,
				originCurrency: params.originCurrency,
				destinationCurrency: params.destinationCurrency ?? USDC_ADDRESS,
				amount: params.amount,
				tradeType: "EXACT_INPUT",
				useDepositAddress: true,
				strict: params.strict ?? false,
				refundTo: params.refundTo ?? ZERO_ADDRESS,
			},
		});

		const item = response.steps
			?.flatMap((step) => step.items ?? [])
			.find((candidate) => candidate.depositAddress);

		if (!item?.depositAddress) {
			throw new Error(
				"Relay returned a quote without a deposit address. This usually means the API key lacks deposit-address access, or the route does not support them.",
			);
		}

		const currencyIn = response.details?.currencyIn;
		return {
			requestId: response.requestId,
			depositAddress: item.depositAddress,
			amount: currencyIn?.amount ?? params.amount,
			amountFormatted: currencyIn?.amountFormatted ?? "",
			originChainId: currencyIn?.currency?.chainId ?? params.originChainId,
			originCurrency: currencyIn?.currency?.address ?? params.originCurrency,
			originSymbol: currencyIn?.currency?.symbol ?? "",
			destinationAmountFormatted: response.details?.currencyOut?.amountFormatted ?? "",
			statusEndpoint: item.check?.endpoint ?? `/intents/status/v3?requestId=${response.requestId}`,
		};
	}

	async getStatus(requestId: string): Promise<DepositStatus> {
		const raw = await requestJson<{
			status?: string;
			inTxHashes?: string[];
			outTxHashes?: string[];
		}>("relay", this.baseUrl, "/intents/status/v3", {
			query: { requestId },
			headers: this.headers,
			timeoutMs: this.timeoutMs,
		});

		const status = raw.status ?? "pending";
		return {
			status,
			requestId,
			inTxHashes: raw.inTxHashes ?? [],
			outTxHashes: raw.outTxHashes ?? [],
			isComplete: status === "success",
			isFailed: status === "failure" || status === "refund",
		};
	}
}
