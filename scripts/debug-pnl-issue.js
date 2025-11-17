#!/usr/bin/env node

/**
 * Debug script to test PnL calculation issue
 * Run with: node scripts/debug-pnl-issue.js
 */

// Simulate the exact PnL calculation logic from the app
function calculatePositionPnL(entryPrice, currentPrice, margin, leverage, isLong) {
	const marginValue = parseFloat(margin.replace(/[$,]/g, ""));
	const leverageValue = parseFloat(leverage.replace(/x/g, ""));
	const entryPriceValue = parseFloat(entryPrice.replace(/[$,]/g, ""));
	const currentPriceValue = parseFloat(currentPrice.replace(/[$,]/g, ""));

	// Check for zero or invalid values
	if (
		currentPriceValue === 0 ||
		entryPriceValue === 0 ||
		marginValue === 0 ||
		leverageValue === 0
	) {
		return null;
	}

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

const testCases = [
	{
		name: "Price increase - Long position (should be profitable)",
		entryPrice: "$45000.00",
		currentPrice: "$45500.00", // +$500 increase
		margin: "$1000.00",
		leverage: "10x",
		isLong: true,
		expectedSign: "positive",
	},
	{
		name: "Price decrease - Long position (should be loss)",
		entryPrice: "$45000.00",
		currentPrice: "$44500.00", // -$500 decrease
		margin: "$1000.00",
		leverage: "10x",
		isLong: true,
		expectedSign: "negative",
	},
	{
		name: "Price decrease - Short position (should be profitable)",
		entryPrice: "$45000.00",
		currentPrice: "$44500.00", // -$500 decrease
		margin: "$1000.00",
		leverage: "10x",
		isLong: false,
		expectedSign: "positive",
	},
	{
		name: "Same price (should be zero PnL)",
		entryPrice: "$45000.00",
		currentPrice: "$45000.00", // No change
		margin: "$1000.00",
		leverage: "10x",
		isLong: true,
		expectedSign: "zero",
	},
	{
		name: "Small price change (micro movements)",
		entryPrice: "$45000.123456789",
		currentPrice: "$45000.133456789", // +0.01 increase
		margin: "$1000.00",
		leverage: "10x",
		isLong: true,
		expectedSign: "positive",
	},
];

testCases.forEach((testCase, _index) => {
	const result = calculatePositionPnL(
		testCase.entryPrice,
		testCase.currentPrice,
		testCase.margin,
		testCase.leverage,
		testCase.isLong,
	);

	if (result) {
		const actualSign =
			result.unrealizedPnL > 0 ? "positive" : result.unrealizedPnL < 0 ? "negative" : "zero";
		const _isCorrect = actualSign === testCase.expectedSign;
	} else {
	}
});
