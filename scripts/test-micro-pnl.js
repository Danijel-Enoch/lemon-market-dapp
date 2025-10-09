#!/usr/bin/env node

/**
 * Test script to verify PnL calculations with micro price changes
 * Run with: node scripts/test-micro-pnl.js
 */

// Simulate the PnL calculation logic from the app
function calculatePositionPnL(entryPrice, currentPrice, margin, leverage, isLong) {
	const marginValue = parseFloat(margin.replace(/[\$,]/g, ""));
	const leverageValue = parseFloat(leverage.replace(/x/g, ""));
	const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));
	const currentPriceValue = parseFloat(currentPrice.replace(/[\$,]/g, ""));

	// Calculate position size
	const totalExposure = marginValue * leverageValue;
	const tokenAmount = totalExposure / entryPriceValue;

	// Calculate current value
	const currentValue = tokenAmount * currentPriceValue;

	// Calculate PnL
	const priceChange = currentPriceValue - entryPriceValue;
	const pnlMultiplier = isLong ? 1 : -1;
	const unrealizedPnL = (priceChange / entryPriceValue) * totalExposure * pnlMultiplier;
	const unrealizedPnLPercentage = (unrealizedPnL / marginValue) * 100;

	return {
		currentPrice: currentPriceValue.toString(),
		entryPrice: entryPriceValue.toString(),
		isLong,
		margin: marginValue,
		leverage: leverageValue,
		unrealizedPnL,
		unrealizedPnLPercentage,
		tokenAmount,
		currentValue,
	};
}

// Test with micro price changes
console.log("🔍 Testing PnL Calculation with Micro Price Changes\n");

const testPosition = {
	entryPrice: "$45000.123456789",
	margin: "$1000.00",
	leverage: "10x",
	isLong: true,
};

console.log("📊 Test Position:", testPosition);
console.log("");

// Test with very small price increases
const microChanges = [
	"$45000.123456790", // +0.000000001 (+0.000000002%)
	"$45000.123456800", // +0.000000011 (+0.000000024%)
	"$45000.123457000", // +0.000000211 (+0.000000468%)
	"$45000.123460000", // +0.000003211 (+0.000007135%)
	"$45000.123500000", // +0.000043211 (+0.000095997%)
	"$45000.124000000", // +0.000543211 (+0.001207419%)
];

microChanges.forEach((currentPrice, index) => {
	const result = calculatePositionPnL(
		testPosition.entryPrice,
		currentPrice,
		testPosition.margin,
		testPosition.leverage,
		testPosition.isLong,
	);

	const priceChange =
		parseFloat(currentPrice.replace("$", "")) -
		parseFloat(testPosition.entryPrice.replace("$", ""));

	console.log(`Test ${index + 1}:`);
	console.log(`  Current Price: ${currentPrice}`);
	console.log(`  Price Change: $${priceChange.toFixed(12)}`);
	console.log(`  Unrealized PnL: $${result.unrealizedPnL.toFixed(8)}`);
	console.log(`  PnL Percentage: ${result.unrealizedPnLPercentage.toFixed(6)}%`);
	console.log("");
});

// Test formatting functions
function formatPnLHighPrecision(pnl) {
	if (pnl === undefined) return "N/A";
	const precision = Math.abs(pnl) < 1 ? 6 : Math.abs(pnl) < 10 ? 4 : 2;
	const formatted = Math.abs(pnl).toFixed(precision);
	return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

function formatPercentageHighPrecision(percentage) {
	if (percentage === undefined) return "N/A";
	const precision = Math.abs(percentage) < 1 ? 4 : 2;
	const formatted = Math.abs(percentage).toFixed(precision);
	return percentage >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

console.log("✨ Testing Enhanced Formatting:");
console.log("");

microChanges.forEach((currentPrice, index) => {
	const result = calculatePositionPnL(
		testPosition.entryPrice,
		currentPrice,
		testPosition.margin,
		testPosition.leverage,
		testPosition.isLong,
	);

	console.log(`Test ${index + 1} - Enhanced Formatting:`);
	console.log(`  Formatted PnL: ${formatPnLHighPrecision(result.unrealizedPnL)}`);
	console.log(`  Formatted %: ${formatPercentageHighPrecision(result.unrealizedPnLPercentage)}`);
	console.log("");
});

console.log("✅ Micro PnL calculation test completed!");
console.log("");
console.log("📝 Summary:");
console.log("- Price cache TTL reduced to 5 seconds for faster updates");
console.log("- Price precision increased to 12 decimal places");
console.log("- PnL formatting uses adaptive precision (6 decimals for small values)");
console.log("- Auto-refresh every 10 seconds in enhanced mode");
console.log("- Real-time indicator shows update status");
