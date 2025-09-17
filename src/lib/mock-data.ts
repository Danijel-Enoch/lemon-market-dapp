export interface TradingPair {
	id: string;
	baseAsset: string;
	quoteAsset: string;
	chain: string;
	moneyMarket: string;
	apy: number;
	roe: number;
	liquidity: number;
	price: number;
	change24h: number;
	hasRewards: boolean;
	hasAirdrop: boolean;
	maxLeverage: number;
	fundingRate: number;
}

export interface Position {
	id: string;
	pair: string;
	side: "long" | "short";
	size: number;
	margin: number;
	leverage: number;
	entryPrice: number;
	currentPrice: number;
	pnl: number;
	pnlPercentage: number;
	liquidationPrice: number;
	apy: number;
	chain: string;
	moneyMarket: string;
	openedAt: string;
	status: "open" | "closed";
}

export interface Transaction {
	id: string;
	positionId: string;
	type: "open" | "close" | "modify" | "liquidation";
	pair: string;
	side: "long" | "short";
	size: number;
	price: number;
	fee: number;
	timestamp: string;
	txHash: string;
	chain: string;
	status: "confirmed" | "pending" | "failed";
}

export interface ChartData {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface Chain {
	id: string;
	name: string;
	icon: string;
}

export interface MoneyMarket {
	id: string;
	name: string;
	chain: string;
	icon: string;
	tvl: number;
}

// Mock Trading Pairs Data
export const mockTradingPairs: TradingPair[] = [
	{
		id: "1",
		baseAsset: "wstETH",
		quoteAsset: "ETH",
		chain: "Ethereum",
		moneyMarket: "Aave V3",
		apy: 12.45,
		roe: 15.2,
		liquidity: 2500000,
		price: 1.1234,
		change24h: 2.34,
		hasRewards: true,
		hasAirdrop: true,
		maxLeverage: 10,
		fundingRate: 0.0123,
	},
	{
		id: "2",
		baseAsset: "ETH",
		quoteAsset: "USDC",
		chain: "Ethereum",
		moneyMarket: "Compound V3",
		apy: -3.21,
		roe: 8.7,
		liquidity: 5000000,
		price: 2456.78,
		change24h: -1.23,
		hasRewards: false,
		hasAirdrop: false,
		maxLeverage: 5,
		fundingRate: -0.0087,
	},
	{
		id: "3",
		baseAsset: "wBTC",
		quoteAsset: "USDT",
		chain: "Ethereum",
		moneyMarket: "Morpho Blue",
		apy: 8.91,
		roe: 11.4,
		liquidity: 3200000,
		price: 43567.89,
		change24h: 3.45,
		hasRewards: true,
		hasAirdrop: false,
		maxLeverage: 3,
		fundingRate: 0.0234,
	},
	{
		id: "4",
		baseAsset: "eETH",
		quoteAsset: "ETH",
		chain: "Ethereum",
		moneyMarket: "Spark",
		apy: 14.67,
		roe: 18.9,
		liquidity: 1800000,
		price: 1.0987,
		change24h: 1.87,
		hasRewards: true,
		hasAirdrop: true,
		maxLeverage: 8,
		fundingRate: 0.0156,
	},
	{
		id: "5",
		baseAsset: "USDC",
		quoteAsset: "DAI",
		chain: "Ethereum",
		moneyMarket: "Aave V3",
		apy: 4.23,
		roe: 6.1,
		liquidity: 8900000,
		price: 1.0012,
		change24h: 0.01,
		hasRewards: false,
		hasAirdrop: false,
		maxLeverage: 20,
		fundingRate: 0.0045,
	},
	{
		id: "6",
		baseAsset: "LINK",
		quoteAsset: "USDC",
		chain: "Arbitrum",
		moneyMarket: "Aave V3",
		apy: 7.89,
		roe: 9.3,
		liquidity: 1200000,
		price: 14.56,
		change24h: 4.21,
		hasRewards: true,
		hasAirdrop: false,
		maxLeverage: 4,
		fundingRate: 0.0098,
	},
	{
		id: "7",
		baseAsset: "ARB",
		quoteAsset: "ETH",
		chain: "Arbitrum",
		moneyMarket: "Radiant",
		apy: 16.34,
		roe: 21.7,
		liquidity: 950000,
		price: 0.0003456,
		change24h: 6.78,
		hasRewards: true,
		hasAirdrop: true,
		maxLeverage: 6,
		fundingRate: 0.0187,
	},
	{
		id: "8",
		baseAsset: "MATIC",
		quoteAsset: "USDC",
		chain: "Polygon",
		moneyMarket: "Aave V3",
		apy: 9.12,
		roe: 12.8,
		liquidity: 2100000,
		price: 0.8934,
		change24h: -2.14,
		hasRewards: false,
		hasAirdrop: false,
		maxLeverage: 7,
		fundingRate: -0.0067,
	},
];

// Mock Positions Data
export const mockPositions: Position[] = [
	{
		id: "pos-1",
		pair: "wstETH/ETH",
		side: "long",
		size: 5.2,
		margin: 1.04,
		leverage: 5,
		entryPrice: 1.1156,
		currentPrice: 1.1234,
		pnl: 0.0364,
		pnlPercentage: 3.5,
		liquidationPrice: 0.8925,
		apy: 12.45,
		chain: "Ethereum",
		moneyMarket: "Aave V3",
		openedAt: "2024-01-15T10:30:00Z",
		status: "open",
	},
	{
		id: "pos-2",
		pair: "ETH/USDC",
		side: "short",
		size: 2.1,
		margin: 1030.45,
		leverage: 3,
		entryPrice: 2478.9,
		currentPrice: 2456.78,
		pnl: 46.45,
		pnlPercentage: 4.51,
		liquidationPrice: 3098.63,
		apy: -3.21,
		chain: "Ethereum",
		moneyMarket: "Compound V3",
		openedAt: "2024-01-14T14:22:00Z",
		status: "open",
	},
	{
		id: "pos-3",
		pair: "eETH/ETH",
		side: "long",
		size: 8.7,
		margin: 1.09,
		leverage: 8,
		entryPrice: 1.0934,
		currentPrice: 1.0987,
		pnl: 0.0461,
		pnlPercentage: 4.23,
		liquidationPrice: 0.9647,
		apy: 14.67,
		chain: "Ethereum",
		moneyMarket: "Spark",
		openedAt: "2024-01-13T09:15:00Z",
		status: "open",
	},
];

// Mock Transaction History
export const mockTransactions: Transaction[] = [
	{
		id: "tx-1",
		positionId: "pos-1",
		type: "open",
		pair: "wstETH/ETH",
		side: "long",
		size: 5.2,
		price: 1.1156,
		fee: 0.0052,
		timestamp: "2024-01-15T10:30:00Z",
		txHash: "0x1234567890abcdef1234567890abcdef12345678",
		chain: "Ethereum",
		status: "confirmed",
	},
	{
		id: "tx-2",
		positionId: "pos-2",
		type: "open",
		pair: "ETH/USDC",
		side: "short",
		size: 2.1,
		price: 2478.9,
		fee: 5.21,
		timestamp: "2024-01-14T14:22:00Z",
		txHash: "0xabcdef1234567890abcdef1234567890abcdef12",
		chain: "Ethereum",
		status: "confirmed",
	},
	{
		id: "tx-3",
		positionId: "pos-3",
		type: "open",
		pair: "eETH/ETH",
		side: "long",
		size: 8.7,
		price: 1.0934,
		fee: 0.0087,
		timestamp: "2024-01-13T09:15:00Z",
		txHash: "0x567890abcdef1234567890abcdef1234567890ab",
		chain: "Ethereum",
		status: "confirmed",
	},
	{
		id: "tx-4",
		positionId: "pos-1",
		type: "modify",
		pair: "wstETH/ETH",
		side: "long",
		size: 1.3,
		price: 1.1189,
		fee: 0.0013,
		timestamp: "2024-01-16T16:45:00Z",
		txHash: "0x890abcdef1234567890abcdef1234567890abcdef",
		chain: "Ethereum",
		status: "confirmed",
	},
];

// Mock Chart Data (24h price data)
export const mockChartData: ChartData[] = Array.from({ length: 24 }, (_, i) => {
	const basePrice = 2456.78;
	const timestamp = Date.now() - (23 - i) * 60 * 60 * 1000;
	const volatility = 0.02;
	const trend = Math.sin(i * 0.5) * 0.01;

	const open = basePrice * (1 + trend + (Math.random() - 0.5) * volatility);
	const close = open * (1 + (Math.random() - 0.5) * volatility * 0.5);
	const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.3);
	const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.3);
	const volume = Math.random() * 1000000 + 500000;

	return {
		timestamp,
		open,
		high,
		low,
		close,
		volume,
	};
});

// Mock Chains Data
export const mockChains: Chain[] = [
	{
		id: "ethereum",
		name: "Ethereum",
		icon: "https://via.placeholder.com/24x24/627EEA/FFFFFF?text=ETH",
	},
	{
		id: "arbitrum",
		name: "Arbitrum",
		icon: "https://via.placeholder.com/24x24/2D374B/FFFFFF?text=ARB",
	},
	{
		id: "polygon",
		name: "Polygon",
		icon: "https://via.placeholder.com/24x24/8247E5/FFFFFF?text=POL",
	},
	{
		id: "optimism",
		name: "Optimism",
		icon: "https://via.placeholder.com/24x24/FF0420/FFFFFF?text=OP",
	},
	{
		id: "base",
		name: "Base",
		icon: "https://via.placeholder.com/24x24/0052FF/FFFFFF?text=BASE",
	},
	{
		id: "avalanche",
		name: "Avalanche",
		icon: "https://via.placeholder.com/24x24/E84142/FFFFFF?text=AVAX",
	},
];

// Mock Money Markets Data
export const mockMoneyMarkets: MoneyMarket[] = [
	{
		id: "aave-v3",
		name: "Aave V3",
		chain: "ethereum",
		icon: "https://via.placeholder.com/24x24/B6509E/FFFFFF?text=AAVE",
		tvl: 12500000000,
	},
	{
		id: "compound-v3",
		name: "Compound V3",
		chain: "ethereum",
		icon: "https://via.placeholder.com/24x24/00D395/FFFFFF?text=COMP",
		tvl: 8900000000,
	},
	{
		id: "morpho-blue",
		name: "Morpho Blue",
		chain: "ethereum",
		icon: "https://via.placeholder.com/24x24/0066FF/FFFFFF?text=MORPHO",
		tvl: 3200000000,
	},
	{
		id: "spark",
		name: "Spark",
		chain: "ethereum",
		icon: "https://via.placeholder.com/24x24/F5AC37/FFFFFF?text=SPARK",
		tvl: 2100000000,
	},
	{
		id: "radiant",
		name: "Radiant",
		chain: "arbitrum",
		icon: "https://via.placeholder.com/24x24/FFD700/FFFFFF?text=RDNT",
		tvl: 950000000,
	},
	{
		id: "dolomite",
		name: "Dolomite",
		chain: "arbitrum",
		icon: "https://via.placeholder.com/24x24/8B4513/FFFFFF?text=DOLO",
		tvl: 650000000,
	},
];

// Mock Statistics
export const mockStats = {
	totalVolume: 3099934289,
	totalOpenInterest: 279917144,
	totalUsers: 15868,
	activePairs: 247,
};
