/** Wire types for the Pacifica REST API. Field names mirror the API exactly. */

/** Every Pacifica response is wrapped in this envelope. */
export interface PacificaEnvelope<T> {
	success: boolean;
	data: T;
	error: string | null;
	code: number | null;
}

export type Side = "bid" | "ask";
/** Good-till-cancel, immediate-or-cancel, add-liquidity-only (post only). */
export type TimeInForce = "GTC" | "IOC" | "ALO";

/** `GET /api/v1/info` — the tradable universe. */
export interface PacificaMarketInfo {
	symbol: string;
	tick_size: string;
	min_tick: string;
	max_tick: string;
	lot_size: string;
	max_leverage: number;
	isolated_only: boolean;
	min_order_size: string;
	max_order_size: string;
	/** Per-hour rate as a decimal string. Positive means longs pay shorts. */
	funding_rate: string;
	next_funding_rate: string;
	created_at: number;
	instrument_type: string;
	base_asset: string;
	execution_modes: string[];
}

/** `GET /api/v1/info/prices` — one row per market. */
export interface PacificaPrice {
	symbol: string;
	mark: string;
	mid: string;
	oracle: string;
	funding: string;
	next_funding: string;
	open_interest: string;
	volume_24h: string;
	/** Close 24h ago. With `mark`, this is what gives the 24h change. */
	yesterday_price: string;
	timestamp: number;
}

export interface PacificaOrderbookLevel {
	p: string;
	a: string;
	n: number;
}

/** `GET /api/v1/book` — `l[0]` is bids, `l[1]` is asks. */
export interface PacificaOrderbook {
	s: string;
	l: [PacificaOrderbookLevel[], PacificaOrderbookLevel[]];
	t: number;
}

export interface PacificaCandle {
	t: number;
	T: number;
	s: string;
	i: string;
	o: string;
	c: string;
	h: string;
	l: string;
	v: string;
	n: number;
}

/** `GET /api/v1/account` */
export interface PacificaAccountInfo {
	account_equity: string;
	available_to_spend: string;
	available_to_withdraw: string;
	balance: string;
	fee_level: number;
	orders_count: number;
	positions_count: number;
	stop_orders_count: number;
	pending_balance: string;
	total_margin_used: string;
	account_leverage?: string;
	updated_at?: number;
}

export interface PacificaPosition {
	symbol: string;
	side: Side;
	amount: string;
	entry_price: string;
	margin: string;
	funding: string;
	isolated: boolean;
	created_at: number;
	updated_at: number;
}

export interface PacificaOpenOrder {
	order_id: number;
	client_order_id: string | null;
	symbol: string;
	side: Side;
	price: string;
	initial_amount: string;
	filled_amount: string;
	cancelled_amount: string;
	order_type: string;
	stop_price: string | null;
	reduce_only: boolean;
	created_at: number;
	updated_at: number;
}

export interface PacificaBridgeAsset {
	symbol: string;
	minimum_deposit: string;
	withdrawal_fee: string;
	/** Solana program that custodies deposits for this asset. */
	bridge_program: string;
	/** SPL mint, or null for native SOL. */
	mint: string | null;
	decimals: number;
}

/** `POST /api/v1/orders/create*` */
export interface PacificaOrderReceipt {
	order_id: number;
}

/** Raised for a non-2xx response, or a 200 whose envelope reports failure. */
export class PacificaError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code: number | null = null,
	) {
		super(message);
		this.name = "PacificaError";
	}
}
