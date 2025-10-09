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

console.log("🧪 Testing Position Size Calculations");
console.log("=====================================");

// Test the formatPositionSize function
console.log("\n📊 Position Size Test:");
console.log("Margin:", testPosition.margin);
console.log("Leverage:", testPosition.leverage);
console.log("Entry Price:", testPosition.entryPrice);
console.log("Token Symbol:", testPosition.tokenSymbol);
console.log("Current Price:", currentPrice);

const positionSize = formatPositionSize(
	testPosition.margin,
	testPosition.leverage,
	testPosition.entryPrice,
	testPosition.tokenSymbol,
	currentPrice,
);

console.log("\n✅ Result:", positionSize);

// Test the calculatePositionCurrentValue function
console.log("\n📈 Current Value Calculation Test:");
const currentValue = calculatePositionCurrentValue(
	testPosition.margin,
	testPosition.leverage,
	testPosition.entryPrice,
	currentPrice,
	testPosition.isLong,
);

console.log("Token Amount:", currentValue.tokenAmount.toFixed(6));
console.log("Current Worth: $" + currentValue.currentWorth.toFixed(2));
console.log("Unrealized PnL: $" + currentValue.unrealizedPnl.toFixed(2));
console.log("PnL Percentage:", currentValue.unrealizedPnlPercentage);

// Test with another example - Short position
console.log("\n📉 Short Position Test:");
const shortValue = calculatePositionCurrentValue(
	"$500.00", // Higher margin
	"5x", // Higher leverage
	"$50000.00", // Higher entry price
	"$45000.00", // Lower current price (profitable for short)
	false, // Short position
);

console.log("Short Position - Token Amount:", shortValue.tokenAmount.toFixed(6));
console.log("Short Position - Current Worth: $" + shortValue.currentWorth.toFixed(2));
console.log("Short Position - Unrealized PnL: $" + shortValue.unrealizedPnl.toFixed(2));
console.log("Short Position - PnL Percentage:", shortValue.unrealizedPnlPercentage);

console.log("\n✅ All tests completed!");
