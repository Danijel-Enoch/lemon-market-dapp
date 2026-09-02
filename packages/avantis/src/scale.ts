import { fromBaseUnits } from "@lemon/core";

/** Avantis scales prices, leverage and slippage by 1e10; USDC by 1e6. */
export const PRICE_DECIMALS = 10;
export const LEVERAGE_DECIMALS = 10;
export const USDC_DECIMALS = 6;

export function priceToNumber(raw: string | bigint): number {
	return Number(fromBaseUnits(raw, PRICE_DECIMALS));
}

export function leverageToNumber(raw: string | bigint): number {
	return Number(fromBaseUnits(raw, LEVERAGE_DECIMALS));
}

export function usdcToNumber(raw: string | bigint): number {
	return Number(fromBaseUnits(raw, USDC_DECIMALS));
}

/** 0 is the protocol's "unset" sentinel for TP, SL and liquidation price. */
export function optionalPrice(raw: string | bigint): number | null {
	const value = priceToNumber(raw);
	return value === 0 ? null : value;
}
