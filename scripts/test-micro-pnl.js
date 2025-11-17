#!/usr/bin/env node

/**
 * Test script to verify PnL calculations with micro price changes
 * Run with: node scripts/test-micro-pnl.js
 */

// Simulate the PnL calculation logic from the app
function calculatePositionPnL(entryPrice, currentPrice, margin, leverage, isLong) {
	const marginValue = parseFloat(margin.replace(/[$,]/g, ""));
	const leverageValue = parseFloat(leverage.replace(/x/g, ""));
	const entryPriceValue = parseFloat(entryPrice.replace(/[$,]/g, ""));
	const currentPriceValue = parseFloat(currentPrice.replace(/[$,]/g, ""));

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

const testPosition = {
	entryPrice: "$45000.123456789",
	margin: "$1000.00",
	leverage: "10x",
	isLong: true,
};

// Test with very small price increases
const microChanges = [
	"$45000.123456790", // +0.000000001 (+0.000000002%)
	"$45000.123456800", // +0.000000011 (+0.000000024%)
	"$45000.123457000", // +0.000000211 (+0.000000468%)
	"$45000.123460000", // +0.000003211 (+0.000007135%)
	"$45000.123500000", // +0.000043211 (+0.000095997%)
	"$45000.124000000", // +0.000543211 (+0.001207419%)
];

microChanges.forEach((currentPrice, _index) => {
	const _result = calculatePositionPnL(
		testPosition.entryPrice,
		currentPrice,
		testPosition.margin,
		testPosition.leverage,
		testPosition.isLong,
	);

	const _priceChange =
		parseFloat(currentPrice.replace("$", "")) -
		parseFloat(testPosition.entryPrice.replace("$", ""));
});

// Test formatting functions
function _formatPnLHighPrecision(pnl) {
	if (pnl === undefined) return "N/A";
	const precision = Math.abs(pnl) < 1 ? 6 : Math.abs(pnl) < 10 ? 4 : 2;
	const formatted = Math.abs(pnl).toFixed(precision);
	return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

function _formatPercentageHighPrecision(percentage) {
	if (percentage === undefined) return "N/A";
	const precision = Math.abs(percentage) < 1 ? 4 : 2;
	const formatted = Math.abs(percentage).toFixed(precision);
	return percentage >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

microChanges.forEach((currentPrice, _index) => {
	const _result = calculatePositionPnL(
		testPosition.entryPrice,
		currentPrice,
		testPosition.margin,
		testPosition.leverage,
		testPosition.isLong,
	);
});
