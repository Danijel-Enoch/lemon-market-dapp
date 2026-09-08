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

/**
 * One EVM transaction Relay wants signed and broadcast, as returned by a quote.
 *
 * The gas fields are Relay's estimate at quote time. They are deliberately not
 * forwarded to the wallet — a quote is fetched seconds before it is sent and
 * Base's fee market moves in that window, so a stale `maxFeePerGas` is a
 * transaction that sits unmined with a vault's margin already committed to it.
 * Estimating at send time costs one RPC call and cannot go stale.
 */
export interface EvmTransactionData {
	from: string;
	to: string;
	data: string;
	value: string;
	chainId: number;
	gas?: string;
	maxFeePerGas?: string;
	maxPriorityFeePerGas?: string;
}

/** One Solana instruction, in the shape Relay returns rather than the SDK's. */
export interface SvmInstructionData {
	keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
	programId: string;
	/** Instruction data as hex, with or without a leading `0x`. */
	data: string;
}

/**
 * The Solana half of a quote: instructions, plus the tables they are compiled
 * against.
 *
 * `addressLookupTableAddresses` is not optional in practice — Relay's deposit
 * instruction references accounts through a table — and a caller that ignores
 * it and compiles a legacy transaction is building a different transaction from
 * the one that was quoted.
 */
export interface SvmTransactionData {
	instructions: SvmInstructionData[];
	addressLookupTableAddresses: string[];
}

export type RelayTransactionData = EvmTransactionData | SvmTransactionData;

export interface RelayStepItem {
	status?: string;
	data: RelayTransactionData;
	/** Present on the step whose confirmation starts the fill. */
	check?: { endpoint?: string; method?: string };
}

export interface RelayStep {
	/** `approve`, `deposit`, and so on. Ordering is significant. */
	id: string;
	kind: string;
	items?: RelayStepItem[];
}

/**
 * A quote, with the transactions that execute it.
 *
 * This is the ordinary Relay flow: the origin wallet signs and broadcasts the
 * steps itself, and the relayer fills on the destination chain against the
 * resulting on-chain event. The alternative — a deposit address the origin
 * wallet simply transfers to — reads more simply but is gated behind an API key
 * permission, and a route that lacks it returns these steps anyway. Executing
 * the steps therefore works on every key and every route, which is the reason
 * this client only does it this way.
 */
export interface RelayQuote {
	requestId: string;
	/** Execute in order. Every item's `data` is one transaction. */
	steps: RelayStep[];
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
	steps?: RelayStep[];
	details?: {
		currencyIn?: {
			currency?: { chainId: number; address: string; symbol: string };
			amount?: string;
			amountFormatted?: string;
		};
		currencyOut?: { amountFormatted?: string };
	};
}

/**
 * Whether a step's payload is Solana's instruction form or an EVM transaction.
 *
 * Discriminated on `instructions` rather than on the chain id the caller asked
 * for, so a route that returns the other VM's shape is caught where it is used
 * instead of being coerced into a transaction the wallet cannot build.
 */
export function isSvmTransaction(data: RelayTransactionData): data is SvmTransactionData {
	return Array.isArray((data as SvmTransactionData).instructions);
}

/**
 * Client for Relay, used to move USDC between the chains the vault trades on.
 *
 * The API key is optional. It raises rate limits and attributes volume, and
 * quotes work without one — so a missing key is not a reason to refuse to
 * start, and the client does not treat it as one.
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
	 * Quote a bridge into USDC, and get back the transactions that execute it.
	 *
	 * Defaults to USDC on Base, which is where the app's spot venue settles.
	 * `destinationChainId` opens the same machinery up to Solana, for funding a
	 * Pacifica account — the recipient there is a base58 address, not an EVM one,
	 * which is why this takes a plain string.
	 *
	 * `refundTo` defaults to the origin chain's native-currency zero address,
	 * which is Relay's opt-in for automatic refunds back to whoever sent the
	 * funds. Omitting it disables refunds entirely — there is no fallback — so a
	 * failed bridge would strand the deposit.
	 */
	async quote(params: {
		recipient: Address | string;
		/**
		 * Who is sending, on the origin chain. Defaults to the recipient, which
		 * is right for a same-VM bridge and wrong for a cross-VM one — an EVM
		 * wallet funding a Solana address is not its own sender.
		 *
		 * Unlike with a deposit address this is not merely bookkeeping: it becomes
		 * the `from` of every step, and the signer the instructions require.
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
	}): Promise<RelayQuote> {
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
				strict: params.strict ?? false,
				refundTo: params.refundTo ?? ZERO_ADDRESS,
			},
		});

		const steps = (response.steps ?? []).filter((step) => (step.items ?? []).length > 0);
		if (steps.length === 0) {
			throw new Error(
				"Relay returned a quote with no transaction steps, so there is nothing to execute. The route may be unsupported or temporarily unavailable.",
			);
		}

		const check = steps.flatMap((step) => step.items ?? []).find((item) => item.check?.endpoint)
			?.check?.endpoint;

		const currencyIn = response.details?.currencyIn;
		return {
			requestId: response.requestId,
			steps,
			amount: currencyIn?.amount ?? params.amount,
			amountFormatted: currencyIn?.amountFormatted ?? "",
			originChainId: currencyIn?.currency?.chainId ?? params.originChainId,
			originCurrency: currencyIn?.currency?.address ?? params.originCurrency,
			originSymbol: currencyIn?.currency?.symbol ?? "",
			destinationAmountFormatted: response.details?.currencyOut?.amountFormatted ?? "",
			statusEndpoint: check ?? `/intents/status/v3?requestId=${response.requestId}`,
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
