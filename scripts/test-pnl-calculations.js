#!/usr/bin/env node

/**
 * Test script to verify PnL calculations using token price service
 * instead of subgraph data
 */

const _path = require("node:path");
const { exec } = require("node:child_process");

// Mock position data for testing
const _mockPosition = {
	id: "test-position-1",
	positionId: "1",
	pair: "BTC/USDT",
	side: "Long",
	tokenSymbol: "BTC",
	isLong: true,
	entryPrice: "$45000.00",
	margin: "$1000.00",
	leverage: "5x",
	liquidationPrice: "$40000.00",
	status: "OPEN",
	pnl: "$0.00",
	pnlRaw: null, // This should now be calculated instead of using subgraph data
	openedAt: new Date().toISOString(),
	lastUpdatedAt: new Date().toISOString(),
	lastTransactionHash: "0x123...",
	trader: "0x742d35cc6670c4acc6b85d5ca0c18759b817b4b22",
};
