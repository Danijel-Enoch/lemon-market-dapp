import type { Address, Hex } from "@lemon/core";

/** Every KyberSwap response uses this envelope; `code` 0 means success. */
export interface KyberEnvelope<T> {
	code: number;
	message: string;
	data: T;
}

/** "No pool exists for this pair" — an expected state, not an error. */
export const KYBER_ROUTE_NOT_FOUND = 4008;

export interface RouteHop {
	pool: string;
	tokenIn: Address;
	tokenOut: Address;
	exchange: string;
	poolType: string;
	swapAmount: string;
	amountOut: string;
}

export interface RouteSummary {
	tokenIn: Address;
	amountIn: string;
	amountInUsd: string;
	tokenOut: Address;
	amountOut: string;
	amountOutUsd: string;
	gas: string;
	gasPrice: string;
	gasUsd: string;
	route: RouteHop[][];
}

export interface GetRouteData {
	routeSummary: RouteSummary;
	routerAddress: Address;
}

export interface BuildRouteData {
	amountIn: string;
	amountInUsd: string;
	amountOut: string;
	amountOutUsd: string;
	gas: string;
	gasUsd: string;
	data: Hex;
	routerAddress: Address;
}

// --- Limit orders ---------------------------------------------------------

export interface LimitOrderSignMessage {
	domain: Record<string, unknown>;
	types: Record<string, { name: string; type: string }[]>;
	message: Record<string, unknown> & { salt: string };
	primaryType?: string;
}

export interface LimitOrderInput {
	chainId: string;
	makerAsset: Address;
	takerAsset: Address;
	maker: Address;
	/** Amount the maker sells, in the maker asset's base units. */
	makingAmount: string;
	/** Amount the maker wants back, in the taker asset's base units. */
	takingAmount: string;
	/** Unix seconds. */
	expiredAt: number;
	allowedSenders?: Address[];
}

export interface LimitOrder {
	id: number;
	chainId: string;
	makerAsset: Address;
	takerAsset: Address;
	maker: Address;
	makingAmount: string;
	takingAmount: string;
	filledMakingAmount: string;
	filledTakingAmount: string;
	status: string;
	expiredAt: number;
	createdAt: number;
}
