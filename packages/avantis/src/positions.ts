import type { OrderType, PerpOrder, PerpPosition } from "@lemon/core";
import { leverageToNumber, optionalPrice, priceToNumber, usdcToNumber } from "./scale";
import type { RawOrderEntry, RawPositionsData, RawTradeEntry } from "./types";

/** Contract order-type codes, per the tx-builder enum mapping. */
const ORDER_TYPES: Record<string, OrderType> = {
	"0": "market",
	"1": "stop_limit",
	"2": "limit",
	"3": "market_pnl",
	market: "market",
	limit: "limit",
	stop_limit: "stop_limit",
	market_pnl: "market_pnl",
};

/**
 * `pairIndex` arrives as a decimal string; the caller supplies the symbol
 * lookup so positions can be labelled without a second catalog fetch.
 */
export type SymbolResolver = (pairIndex: number) => string | undefined;

function normalizeTrade(entry: RawTradeEntry, resolveSymbol?: SymbolResolver): PerpPosition {
	const { trade } = entry;
	const pairIndex = Number(trade.pairIndex);
	const collateralUsdc = usdcToNumber(trade.positionSizeUSDC);
	const leverage = leverageToNumber(trade.leverage);

	return {
		pairIndex,
		symbol: resolveSymbol?.(pairIndex) ?? `#${pairIndex}`,
		index: Number(trade.index),
		side: trade.buy ? "long" : "short",
		// positionSizeUSDC is collateral despite the name; notional is derived.
		collateralUsdc,
		leverage,
		notionalUsdc: collateralUsdc * leverage,
		openPrice: priceToNumber(trade.openPrice),
		liquidationPrice: optionalPrice(entry.liquidationPrice),
		takeProfit: optionalPrice(trade.tp),
		stopLoss: optionalPrice(trade.sl),
		coinExposure: entry.coinExposure ? priceToNumber(entry.coinExposure) : null,
		openTimestamp: Number(trade.timestamp),
	};
}

function normalizeOrder(entry: RawOrderEntry, resolveSymbol?: SymbolResolver): PerpOrder {
	const { order } = entry;
	const pairIndex = Number(order.pairIndex);

	return {
		pairIndex,
		symbol: resolveSymbol?.(pairIndex) ?? `#${pairIndex}`,
		index: Number(order.index),
		side: order.buy ? "long" : "short",
		orderType: ORDER_TYPES[String(entry.orderType)] ?? "limit",
		collateralUsdc: usdcToNumber(order.positionSizeUSDC),
		leverage: leverageToNumber(order.leverage),
		triggerPrice: priceToNumber(order.openPrice),
	};
}

export function normalizePositions(
	data: RawPositionsData,
	resolveSymbol?: SymbolResolver,
): { positions: PerpPosition[]; orders: PerpOrder[] } {
	return {
		positions: (data.trades ?? []).map((entry) => normalizeTrade(entry, resolveSymbol)),
		orders: (data.orders ?? []).map((entry) => normalizeOrder(entry, resolveSymbol)),
	};
}

/**
 * Unrealised PnL in USDC. Longs gain as price rises, shorts as it falls; the
 * move is levered by the position's leverage against its collateral.
 */
export function unrealizedPnl(position: PerpPosition, markPrice: number): number {
	if (!Number.isFinite(markPrice) || position.openPrice === 0) return 0;
	const direction = position.side === "long" ? 1 : -1;
	const move = (markPrice - position.openPrice) / position.openPrice;
	return position.notionalUsdc * move * direction;
}

export function pnlPercent(position: PerpPosition, markPrice: number): number {
	if (position.collateralUsdc === 0) return 0;
	return (unrealizedPnl(position, markPrice) / position.collateralUsdc) * 100;
}
