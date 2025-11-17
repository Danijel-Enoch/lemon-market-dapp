#!/usr/bin/env node

/**
 * Test script for position size calculations
 */

const { formatPositionSize, calculatePositionCurrentValue } = require("../src/lib/position-api.ts");

// Test data similar to what we get from the API
const testPosition = {
	margin: "$100.00",
	leverage: "2x",
	entryPrice: "$0.03",
	tokenSymbol: "TST",
	isLong: true,
};

const currentPrice = "$45,234.56"; // BTC current price from the UI

const _positionSize = formatPositionSize(
	testPosition.margin,
	testPosition.leverage,
	testPosition.entryPrice,
	testPosition.tokenSymbol,
	currentPrice,
);
const _currentValue = calculatePositionCurrentValue(
	testPosition.margin,
	testPosition.leverage,
	testPosition.entryPrice,
	currentPrice,
	testPosition.isLong,
);
const _shortValue = calculatePositionCurrentValue(
	"$500.00", // Higher margin
	"5x", // Higher leverage
	"$50000.00", // Higher entry price
	"$45000.00", // Lower current price (profitable for short)
	false, // Short position
);
