import type { Address, Hex } from "@lemon/core";

/** Every tx-builder response is wrapped in this envelope. */
export interface AvantisEnvelope<T> {
	ok: true;
	data: T;
}

export interface RawPairFeedAttributes {
	symbol?: string;
	assetType?: string;
	isOpen?: boolean;
	nextOpen?: number;
	nextClose?: number;
	schedule?: string;
}

export interface RawPair {
	index: number;
	from: string;
	to: string;
	symbol: string;
	groupIndex: number;
	isPairListed: boolean;
	closeOnly: boolean;
	isPnlTypeAllowed: boolean;
	leverages: {
		minLeverage: number;
		maxLeverage: number;
		pnlMinLeverage: number;
		pnlMaxLeverage: number;
	};
	pairMinLevPosUSDC: number;
	pairOI: number;
	pairMaxOI: number;
	maxWalletOI: number;
	feed?: { attributes?: RawPairFeedAttributes };
	schedule?: { isOpen: boolean; nextOpen: number; nextClose: number };
}

/**
 * On-chain Trade struct. All numeric fields are decimal strings in on-chain
 * units: USDC 1e6, prices and leverage 1e10.
 *
 * `positionSizeUSDC` is the *collateral*, not the leveraged notional — the
 * on-chain name is misleading and reading it as size overstates positions by
 * the leverage factor.
 */
export interface RawTrade {
	trader: Address;
	pairIndex: string;
	index: string;
	initialPosToken: string;
	positionSizeUSDC: string;
	openPrice: string;
	buy: boolean;
	leverage: string;
	tp: string;
	sl: string;
	timestamp: string;
}

export interface RawTradeEntry {
	trade: RawTrade;
	tradeInfo?: Record<string, string>;
	rolloverFee: string;
	liquidationPrice: string;
	isPnl: boolean;
	coinExposure: string;
}

export interface RawOrderEntry {
	order: RawTrade;
	liquidationPrice: string;
	orderType: string | number;
	coinExposure: string;
}

export interface RawPositionsData {
	trader: Address;
	trades: RawTradeEntry[];
	orders: RawOrderEntry[];
}

export interface AvantisAddresses {
	tradingRouter: Address;
	tradingStorage: Address;
	pairStorage: Address;
	pairInfos: Address;
	priceAggregator: Address;
	multicall: Address;
	usdc: Address;
	referral: Address;
	tranche: Address;
	execute: Address;
	vaultManager: Address;
	builderCode: Address;
}

/** An unsigned transaction as returned by the `/v2/trade/*` builder endpoints. */
export interface RawUnsignedTx {
	to: Address;
	data: Hex;
	value?: string;
	chainId?: number;
	gas?: string;
}

/** A ready-to-sign EIP-712 payload from the `/v2/intents/*` endpoints. */
export interface RawIntent {
	intent: string;
	signerRule: "trader-only" | "trader-or-delegate";
	domain: {
		name: string;
		version: string;
		chainId: number;
		verifyingContract: Address;
	};
	types: Record<string, { name: string; type: string }[]>;
	primaryType: string;
	message: Record<string, unknown>;
	/** `abi.encode(struct)` of the intent — submitted verbatim to batched-market. */
	encodedIntent: Hex;
}

export interface OpenTradeParams {
	trader: Address;
	/** Resolved from the live catalog. Prefer `pair` when you have the symbol. */
	pairIndex?: number;
	pair?: string;
	side: "long" | "short";
	/** Human units: 100 = 100 USDC. */
	collateralUsdc: number;
	/** Plain multiplier: 10 = 10x. */
	leverage: number;
	orderType?: "market" | "limit" | "stop_limit" | "market_pnl";
	slippagePercent?: number;
	openPrice?: number;
	takeProfit?: number;
	stopLoss?: number;
	skipValidation?: boolean;
}

export interface CloseTradeParams {
	trader: Address;
	pairIndex: number;
	index: number;
	/** Collateral to release. Pass the position's full collateral to close out. */
	collateralToCloseUsdc: number;
}

/** Order-type discriminators accepted by the batched-market service. */
export const BATCHED_ORDER_TYPE = {
	MARKET_OPEN: 0,
	MARKET_CLOSE: 1,
	MARKET_OPEN_PNL: 6,
	MARKET_CLOSE_PNL: 7,
	INCREASE_SIZE: 9,
} as const;
