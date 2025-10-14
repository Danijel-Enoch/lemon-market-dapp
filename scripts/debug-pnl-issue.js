#!/usr/bin/env node

/**
 * Debug script to test PnL calculation issue
 * Run with: node scripts/debug-pnl-issue.js
 */

// Simulate the exact PnL calculation logic from the app
function calculatePositionPnL(entryPrice, currentPrice, margin, leverage, isLong) {
    console.log("=== PnL Calculation Debug ===");
    console.log("Input parameters:");
    console.log("- Entry Price:", entryPrice);
    console.log("- Current Price:", currentPrice);
    console.log("- Margin:", margin);
    console.log("- Leverage:", leverage);
    console.log("- Is Long:", isLong);

    const marginValue = parseFloat(margin.replace(/[\$,]/g, ""));
    const leverageValue = parseFloat(leverage.replace(/x/g, ""));
    const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));
    const currentPriceValue = parseFloat(currentPrice.replace(/[\$,]/g, ""));

    console.log("\nParsed values:");
    console.log("- Entry Price Value:", entryPriceValue);
    console.log("- Current Price Value:", currentPriceValue);
    console.log("- Margin Value:", marginValue);
    console.log("- Leverage Value:", leverageValue);

    // Check for zero or invalid values
    if (currentPriceValue === 0 || entryPriceValue === 0 || marginValue === 0 || leverageValue === 0) {
        console.log("\n❌ ERROR: One or more values is zero!");
        console.log("- Current Price is zero:", currentPriceValue === 0);
        console.log("- Entry Price is zero:", entryPriceValue === 0);
        console.log("- Margin is zero:", marginValue === 0);
        console.log("- Leverage is zero:", leverageValue === 0);
        return null;
    }

    // Calculate position size
    const totalExposure = marginValue * leverageValue;
    const tokenAmount = totalExposure / entryPriceValue;

    console.log("\nCalculated values:");
    console.log("- Total Exposure:", totalExposure);
    console.log("- Token Amount:", tokenAmount);

    // Calculate current value
    const currentValue = tokenAmount * currentPriceValue;

    // Calculate PnL
    const priceChange = currentPriceValue - entryPriceValue;
    const pnlMultiplier = isLong ? 1 : -1;
    const unrealizedPnL = (priceChange / entryPriceValue) * totalExposure * pnlMultiplier;
    const unrealizedPnLPercentage = (unrealizedPnL / marginValue) * 100;

    console.log("\nPnL Calculation:");
    console.log("- Price Change:", priceChange);
    console.log("- Price Change %:", ((priceChange / entryPriceValue) * 100).toFixed(4), "%");
    console.log("- PnL Multiplier:", pnlMultiplier);
    console.log("- Unrealized PnL:", unrealizedPnL);
    console.log("- Unrealized PnL %:", unrealizedPnLPercentage);

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

// Test cases
console.log("🧪 Testing PnL Calculation with Different Scenarios\n");

const testCases = [
    {
        name: "Price increase - Long position (should be profitable)",
        entryPrice: "$45000.00",
        currentPrice: "$45500.00", // +$500 increase
        margin: "$1000.00",
        leverage: "10x",
        isLong: true,
        expectedSign: "positive"
    },
    {
        name: "Price decrease - Long position (should be loss)",
        entryPrice: "$45000.00",
        currentPrice: "$44500.00", // -$500 decrease
        margin: "$1000.00",
        leverage: "10x",
        isLong: true,
        expectedSign: "negative"
    },
    {
        name: "Price decrease - Short position (should be profitable)",
        entryPrice: "$45000.00",
        currentPrice: "$44500.00", // -$500 decrease
        margin: "$1000.00",
        leverage: "10x",
        isLong: false,
        expectedSign: "positive"
    },
    {
        name: "Same price (should be zero PnL)",
        entryPrice: "$45000.00",
        currentPrice: "$45000.00", // No change
        margin: "$1000.00",
        leverage: "10x",
        isLong: true,
        expectedSign: "zero"
    },
    {
        name: "Small price change (micro movements)",
        entryPrice: "$45000.123456789",
        currentPrice: "$45000.133456789", // +0.01 increase
        margin: "$1000.00",
        leverage: "10x",
        isLong: true,
        expectedSign: "positive"
    }
];

testCases.forEach((testCase, index) => {
    console.log(`\n--- Test Case ${index + 1}: ${testCase.name} ---`);
    const result = calculatePositionPnL(
        testCase.entryPrice,
        testCase.currentPrice,
        testCase.margin,
        testCase.leverage,
        testCase.isLong
    );

    if (result) {
        const actualSign = result.unrealizedPnL > 0 ? "positive" : result.unrealizedPnL < 0 ? "negative" : "zero";
        const isCorrect = actualSign === testCase.expectedSign;
        console.log(`\n✅ Result: ${isCorrect ? "CORRECT" : "❌ INCORRECT"}`);
        console.log(`Expected: ${testCase.expectedSign}, Got: ${actualSign}`);
        console.log(`Final PnL: $${result.unrealizedPnL >= 0 ? "+" : ""}${result.unrealizedPnL.toFixed(6)}`);
        console.log(`Final PnL %: ${result.unrealizedPnLPercentage >= 0 ? "+" : ""}${result.unrealizedPnLPercentage.toFixed(4)}%`);
    } else {
        console.log("❌ Calculation failed - null result");
    }
});

console.log("\n🎯 Key Points to Check:");
console.log("1. Make sure token prices are being fetched correctly");
console.log("2. Verify that position data from API has correct format");
console.log("3. Check if positions are being marked as OPEN vs CLOSED correctly");
console.log("4. Ensure the token symbol extraction is working properly");
console.log("5. Verify that the frontend is calling the PnL calculation function");

console.log("\n🔧 Next steps:");
console.log("1. Check browser console for PnL calculation logs");
console.log("2. Verify API responses in Network tab");
console.log("3. Check if useUserPositions is being called correctly");
console.log("4. Test with real positions data");
