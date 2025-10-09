/**
 * Token Price Service
 *
 * A comprehensive service that integrates multiple price sources:
 * 1. DexScreener API for getting token addresses and basic price data
 * 2. CoinGecko Terminal API as fallback
 * 3. Lemon Oracle Client for real-time price aggregation across DEXes
 *
 * This service is used for:
 * - Loading user positions with real-time PnL calculations
 * - Modifying/closing trades with accurate price data
 * - Portfolio valuation
 */

import {
	LemonSpotPriceClient,
	type AggregatedPrice,
	type PriceRequest
} from "./lemonOracleClient";

// Configuration
const LEMON_ORACLE_BASE_URL =
	process.env.LEMON_ORACLE_API_URL ||
	"https://app-override-mobile-alarm-fb3c86.kubesmith.app/";
const DEXSCREENER_BASE_URL = "https://api.dexscreener.com/latest";
const COINGECKO_BASE_URL = "https://pro-api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

// Token mapping for common symbols to contract addresses
const TOKEN_ADDRESS_MAP: Record<
	string,
	{ address: string; chain: string; decimals: number }
> = {
	BTC: {
		address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
		chain: "bsc",
		decimals: 18
	}, // BTCB on BSC
	ETH: {
		address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
		chain: "bsc",
		decimals: 18
	}, // ETH on BSC
	BNB: {
		address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		chain: "bsc",
		decimals: 18
	}, // WBNB
	USDT: {
		address: "0x55d398326f99059fF775485246999027B3197955",
		chain: "bsc",
		decimals: 18
	}, // USDT on BSC
	USDC: {
		address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
		chain: "bsc",
		decimals: 18
	}, // USDC on BSC
	ADA: {
		address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
		chain: "bsc",
		decimals: 18
	}, // ADA on BSC
	DOT: {
		address: "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
		chain: "bsc",
		decimals: 18
	}, // DOT on BSC
	LINK: {
		address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
		chain: "bsc",
		decimals: 18
	}, // LINK on BSC
	XRP: {
		address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
		chain: "bsc",
		decimals: 18
	}, // XRP on BSC
	SOL: {
		address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
		chain: "bsc",
		decimals: 18
	}, // SOL on BSC
	TST: {
		address: "0x86Bb94DdD16Efc8bc58e6b056e8df71D9e666429",
		chain: "bsc",
		decimals: 18
	},
	ALU: {
		address: "0x8263CD1601FE73C066bf49cc09841f35348e3be0",
		chain: "bsc",
		decimals: 18
	},
	GIGGLE: {
		address: "0x20d6015660b3fe52e6690a889b5C51F69902cE0e",
		chain: "bsc",
		decimals: 18
	},
	RWA: {
		address: "0x9C8B5CA345247396bDfAc0395638ca9045C6586E",
		chain: "bsc",
		decimals: 18
	},
	"0G": {
		address: "0x4B948d64dE1F71fCd12fB586f4c776421a35b3eE",
		chain: "bsc",
		decimals: 18
	},
	BROCCOLI: {
		address: "0x12B4356C65340Fb02cdff01293F95FEBb1512F3b",
		chain: "bsc",
		decimals: 18
	},
	priceless: {
		address: "0x7d03759E5B41E36899833cb2E008455d69A24444",
		chain: "bsc",
		decimals: 18
	},
	CSI: {
		address: "0x511c24586043eee20e1D98123c06b32Ef00f4444",
		chain: "bsc",
		decimals: 18
	},
	"8": {
		address: "0x33c7d0387e25964F65497cC92637C0eC32944444",
		chain: "bsc",
		decimals: 18
	},
	ASTERINU: {
		address: "0x9f6c24232f1Bba6ef47BCb81b9b9434aCDB94444",
		chain: "bsc",
		decimals: 18
	},
	"4": {
		address: "0x0a43fc31a73013089df59194872ecae4cae14444",

		decimals: 18,

		chain: "bsc"
	},
	EGL1: {
		address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
		chain: "bsc",
		decimals: 18
	},
	szn: {
		address: "0x23b35C7f686CAC8297eA6e81A467286481cA4444",
		chain: "bsc",
		decimals: 18
	},
	ROAM: {
		address: "0x3fefe29dA25BEa166fB5f6ADe7b5976D2b0e586B",
		chain: "bsc",
		decimals: 18
	},
	TUT: {
		address: "0xCAAE2A2F939F51d97CdFa9A86e79e3F085b799f3",
		chain: "bsc",
		decimals: 18
	},
	KOGE: {
		address: "0xe6DF05CE8C8301223373CF5B969AFCb1498c5528",
		chain: "bsc",
		decimals: 18
	},

	WBNB: {
		address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
		chain: "bsc",
		decimals: 18
	},

	ASTER: {
		address: "0x000ae314e2a2172a039b26378814c252734f556a",
		chain: "bsc",
		decimals: 18
	},

	AsterINU: {
		address: "0x9f6c24232f1bba6ef47bcb81b9b9434acdb94444",
		chain: "bsc",
		decimals: 18
	},

	USD1: {
		address: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
		chain: "bsc",
		decimals: 18
	},

	RIVER: {
		address: "0xda7ad9dea9397cffddae2f8a052b82f1484252b3",
		chain: "bsc",
		decimals: 18
	},
	MILK: {
		address: "0x7b4bf9feccff207ef2cb7101ceb15b8516021acd",
		chain: "bsc",
		decimals: 6
	},
	BabyGrok: {
		address: "0x3303113001c51769f2753c2afb7b5a6d0535660e",
		chain: "bsc",
		decimals: 9
	},
	"BNB Card": {
		address: "0xdc06717f367e57a16e06cce0c4761604460da8fc",
		chain: "bsc",
		decimals: 18
	},
	USDA: {
		address: "0x17eafd08994305d8ace37efb82f1523177ec70ee",
		chain: "bsc",
		decimals: 18
	},
	bibi: {
		address: "0x9212cf1f9f4a9c69bb010146ba5b0725169d4444",
		chain: "bsc",
		decimals: 18
	},
	Broccoli: {
		address: "0x12b4356c65340fb02cdff01293f95febb1512f3b",
		chain: "bsc",
		decimals: 18
	},
	gorilla: {
		address: "0xcf640fdf9b3d9e45cbd69fda91d7e22579c14444",
		chain: "bsc",
		decimals: 18
	},
	AIV: {
		address: "0xadf7335da0e77339f2d69841f79b0aa6c14d187d",
		chain: "bsc",
		decimals: 18
	},
	"1": {
		address: "bsc_0xe77223430bfb8e497a3c8e126cb5ad5275934444",
		chain: "bsc",
		decimals: 18
	},

	WBNB_095c: {
		address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		chain: "bsc",
		decimals: 18
	},

	USDT_7955: {
		address: "0x55d398326f99059fF775485246999027B3197955",
		chain: "bsc",
		decimals: 18
	},

	B: {
		address: "0x6bdcCe4A559076e37755a78Ce0c06214E59e4444",
		chain: "bsc",
		decimals: 18
	},
	APD: {
		address: "bsc_0x001208f7f53f78db2b32e1c68198d3e8f320aa23",
		chain: "bsc",
		decimals: 9
	},

	ODIN: {
		address: "0x06C910d728499aA9aA7dA39FB26dDC5DC6ea4444",
		chain: "bsc",
		decimals: 18
	},
	FOUR: {
		address: "0x5050Fb516016A3f41BE2947084815a487762a335",
		chain: "bsc",
		decimals: 18
	},
	CDL: {
		address: "0x84575b87395c970F1F48E87d87a8dB36Ed653716",
		chain: "bsc",
		decimals: 18
	},
	BLUE: {
		address: "bsc_0xa90298e5b1203a2dd0006a75eabe158989c406fb",
		chain: "bsc",
		decimals: 9
	},
	CAT: {
		address: "0x6894CDe390a3f51155ea41Ed24a33A4827d3063D",
		chain: "bsc",
		decimals: 18
	},
	Founder: {
		address: "0x3a08A614ceB8b2380a022E5D35873Fd2D8e64444",
		chain: "bsc",
		decimals: 18
	},
	CTCP: {
		address: "bsc_0xb86414afc434345a91ca80a889d73fd1e8155b4b",
		chain: "bsc",
		decimals: 18
	},
	ASTERP: {
		address: "0x808fd412aDFFD8D377CAD7DFae42f5Da803264Aa",
		chain: "bsc",
		decimals: 18
	},
	WBTC: {
		address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
		chain: "bsc",
		decimals: 18
	},
	松狮犬: {
		address: "bsc_0x55f75fe8345db62fd30d57e0c60903a758484444",
		chain: "bsc",
		decimals: 18
	},
	DogBNBHolder: {
		address: "bsc_0x76d394f4a9c3c30b3a80580f662b1046ece04444",
		chain: "bsc",
		decimals: 18
	},
	HIRONO_4444: {
		address: "bsc_0xfd8e0e655bdc0376a892b11798c40690bd5c4444",
		chain: "bsc",
		decimals: 18
	},
	BNBHolder: {
		address: "0x44440f83419DE123d7d411187aDb9962db017d03",
		chain: "bsc",
		decimals: 18
	},
	"meme rush": {
		address: "0x4444B1e4De34Df52cF91E30cc7c0336Ee03D7c1B",
		chain: "bsc",
		decimals: 18
	},
	哈基米: {
		address: "0x82Ec31D69b3c289E541b50E30681FD1ACAd24444",
		chain: "bsc",
		decimals: 18
	},
	財務自由: {
		address: "bsc_0xb77a1bd00d9c7ff5e15d70c7f78e4b80e18e4444",
		chain: "bsc",
		decimals: 18
	},
	PUP: {
		address: "0x73b84F7E3901F39FC29F3704a03126D317Ab4444",
		chain: "bsc",
		decimals: 18
	},
	PALU: {
		address: "0x02e75d28A8AA2a0033b8cf866fCf0bB0E1eE4444",
		chain: "bsc",
		decimals: 18
	},
	BSC: {
		address: "0x6331BF8D601f0D7F0d2101772af5137c418c4444",
		chain: "bsc",
		decimals: 18
	},
	T4: {
		address: "0x7cf49b2fAB1aE6fe70e22A3F826984EB8D424444",
		chain: "bsc",
		decimals: 18
	},
	币安独家: {
		address: "bsc_0x4444c0c40cd4330207c3c4c21762924d650e9e50",
		chain: "bsc",
		decimals: 18
	},
	$MAIN: {
		address: "0x513F2f88e3083450229B75d24A267E6B3a47dB17",
		chain: "bsc",
		decimals: 18
	},
	DEW: {
		address: "0xA9550C2112a277b03CCfF6aa1BaaacD74c754444",
		chain: "bsc",
		decimals: 18
	},
	KOMA: {
		address: "0xd5eaAaC47bD1993d661bc087E15dfb079a7f3C19",
		chain: "bsc",
		decimals: 18
	},
	KLINK: {
		address: "bsc_0x76e9b54b49739837be8ad10c3687fc6b543de852",
		chain: "bsc",
		decimals: 18
	},
	HUMA: {
		address: "bsc_0x92516e0ddf1ddbf7fab1b79cac26689fdc5ba8e6",
		chain: "bsc",
		decimals: 6
	},
	AOP: {
		address: "bsc_0xd5df4d260d7a0145f655bcbf3b398076f21016c7",
		chain: "bsc",
		decimals: 18
	},
	FORM: {
		address: "0x5b73A93b4E5e4f1FD27D8b3F8C97D69908b5E284",
		chain: "bsc",
		decimals: 18
	},
	Cake: {
		address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
		chain: "bsc",
		decimals: 18
	},
	GAIA: {
		address: "bsc_0xd715cc968c288740028be20685263f43ed1e4837",
		chain: "bsc",
		decimals: 18
	},
	BAS: {
		address: "bsc_0x0f0df6cb17ee5e883eddfef9153fc6036bdb4e37",
		chain: "bsc",
		decimals: 18
	},
	BTCB: {
		address: "bsc_0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
		chain: "bsc",
		decimals: 18
	},
	ZEUS: {
		address: "bsc_0xa2be3e48170a60119b5f0400c65f65f3158fbeee",
		chain: "bsc",
		decimals: 6
	},
	"0x4444": {
		address: "0x4444Bd221671F322671Bfdb3F33A653D2B7605c8",
		chain: "bsc",
		decimals: 18
	},
	YEPE: {
		address: "0xE9E3d8609e50c333b7E8FAFb1a06F5443cb64444",
		chain: "bsc",
		decimals: 18
	}
};

export interface TokenMetadata {
	symbol: string;
	name: string;
	address: string;
	chain: string;
	decimals: number;
	logoUri?: string;
}

export interface TokenPriceData {
	tokenAddress: string;
	symbol: string;
	priceUSD: string;
	priceNative?: string;
	timestamp: number;
	source: "lemon-oracle" | "dexscreener" | "coingecko";
	confidence: "high" | "medium" | "low";
	dexPrices?: Array<{
		dex: string;
		price: string;
		liquidity?: string;
	}>;
}

export interface PnLCalculation {
	currentPrice: string;
	entryPrice: string;
	isLong: boolean;
	margin: number;
	leverage: number;
	unrealizedPnL: number;
	unrealizedPnLPercentage: number;
	liquidationPrice: string;
	tokenAmount: number;
	currentValue: number;
}

export class TokenPriceService {
	private lemonClient: LemonSpotPriceClient;
	private priceCache: Map<
		string,
		{ data: TokenPriceData; timestamp: number }
	> = new Map();
	private cacheTTL = 5000; // Reduced to 5 seconds for micro price changes

	constructor() {
		this.lemonClient = new LemonSpotPriceClient({
			baseUrl: LEMON_ORACLE_BASE_URL,
			timeout: 15000,
			enableCaching: true,
			cacheTTL: 5000, // Reduced cache TTL for better price sensitivity
			maxRetries: 2,
			debug: process.env.NODE_ENV === "development"
		});
	}

	/**
	 * Get token address from symbol using built-in mapping or external APIs
	 */
	async getTokenAddress(symbol: string): Promise<TokenMetadata | null> {
		const upperSymbol = symbol.toUpperCase();

		// Check built-in mapping first
		if (TOKEN_ADDRESS_MAP[upperSymbol]) {
			const tokenInfo = TOKEN_ADDRESS_MAP[upperSymbol];
			return {
				symbol: upperSymbol,
				name: upperSymbol,
				address: tokenInfo.address,
				chain: tokenInfo.chain,
				decimals: tokenInfo.decimals
			};
		}

		// Try DexScreener search
		try {
			const dexScreenerData = await this.searchTokenOnDexScreener(symbol);
			if (dexScreenerData) {
				return dexScreenerData;
			}
		} catch (error) {
			console.warn(`DexScreener search failed for ${symbol}:`, error);
		}

		// Try CoinGecko as fallback
		try {
			const coinGeckoData = await this.searchTokenOnCoinGecko(symbol);
			if (coinGeckoData) {
				return coinGeckoData;
			}
		} catch (error) {
			console.warn(`CoinGecko search failed for ${symbol}:`, error);
		}

		return null;
	}

	/**
	 * Search token on DexScreener
	 */
	private async searchTokenOnDexScreener(
		symbol: string
	): Promise<TokenMetadata | null> {
		const response = await fetch(
			`${DEXSCREENER_BASE_URL}/dex/search/?q=${symbol}`,
			{
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();

		// Look for exact symbol match on BSC
		const match = data.pairs?.find(
			(pair: any) =>
				pair.baseToken?.symbol?.toUpperCase() ===
					symbol.toUpperCase() &&
				pair.chainId === "bsc" &&
				pair.baseToken?.address
		);

		if (match) {
			return {
				symbol: match.baseToken.symbol,
				name: match.baseToken.name || match.baseToken.symbol,
				address: match.baseToken.address,
				chain: "bsc",
				decimals: 18, // Default for BSC tokens
				logoUri: match.info?.imageUrl
			};
		}

		return null;
	}

	/**
	 * Search token on CoinGecko
	 */
	private async searchTokenOnCoinGecko(
		symbol: string
	): Promise<TokenMetadata | null> {
		if (!COINGECKO_API_KEY) {
			console.warn("CoinGecko API key not configured");
			return null;
		}

		const response = await fetch(
			`${COINGECKO_BASE_URL}/search?query=${symbol}`,
			{
				headers: {
					Accept: "application/json",
					"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
				}
			}
		);

		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status}`);
		}

		const data = await response.json();

		// Look for exact symbol match
		const match = data.coins?.find(
			(coin: any) => coin.symbol?.toUpperCase() === symbol.toUpperCase()
		);

		if (match) {
			// Get token details to find BSC contract address
			const detailResponse = await fetch(
				`${COINGECKO_BASE_URL}/coins/${match.id}`,
				{
					headers: {
						Accept: "application/json",
						"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
					}
				}
			);

			if (detailResponse.ok) {
				const details = await detailResponse.json();
				const bscAddress = details.platforms?.["binance-smart-chain"];

				if (bscAddress) {
					return {
						symbol: details.symbol?.toUpperCase(),
						name: details.name,
						address: bscAddress,
						chain: "bsc",
						decimals: 18,
						logoUri: details.image?.large
					};
				}
			}
		}

		return null;
	}

	/**
	 * Get comprehensive price data for a token
	 */
	async getTokenPrice(
		symbol: string,
		pairAddress?: string
	): Promise<TokenPriceData | null> {
		// Check cache first
		const cacheKey = `${symbol}-${pairAddress || "default"}`;
		const cached = this.priceCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.data;
		}

		// Get token metadata
		const tokenMetadata = await this.getTokenAddress(symbol);
		if (!tokenMetadata) {
			console.warn(`Could not find token metadata for ${symbol}`);
			return null;
		}

		let priceData: TokenPriceData | null = null;

		// Try Lemon Oracle first (highest confidence)
		try {
			const oracleResponse = await this.lemonClient.getPrice(
				tokenMetadata.address
			);

			if (oracleResponse.success && oracleResponse.data) {
				const aggregatedPrice = oracleResponse.data;
				const bestPrice =
					this.lemonClient.getBestPrice(aggregatedPrice);

				if (bestPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: bestPrice.priceUSD || bestPrice.price,
						priceNative: bestPrice.price,
						timestamp: Date.now(),
						source: "lemon-oracle",
						confidence: "high",
						dexPrices: aggregatedPrice.prices
							.filter((p) => p.success)
							.map((p) => ({
								dex: p.dex,
								price: p.priceUSD || p.price,
								liquidity: p.liquidity
							}))
					};
				}
			}
		} catch (error) {
			console.warn(`Lemon Oracle failed for ${symbol}:`, error);
		}

		// Fallback to DexScreener
		if (!priceData) {
			try {
				const dexScreenerPrice = await this.getDexScreenerPrice(
					tokenMetadata.address
				);
				if (dexScreenerPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: dexScreenerPrice.toString(),
						timestamp: Date.now(),
						source: "dexscreener",
						confidence: "medium"
					};
				}
			} catch (error) {
				console.warn(
					`DexScreener fallback failed for ${symbol}:`,
					error
				);
			}
		}

		// Final fallback to CoinGecko
		if (!priceData && COINGECKO_API_KEY) {
			try {
				const coinGeckoPrice = await this.getCoinGeckoPrice(
					tokenMetadata.address
				);
				if (coinGeckoPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: coinGeckoPrice.toString(),
						timestamp: Date.now(),
						source: "coingecko",
						confidence: "low"
					};
				}
			} catch (error) {
				console.warn(`CoinGecko fallback failed for ${symbol}:`, error);
			}
		}

		// Cache the result
		if (priceData) {
			this.priceCache.set(cacheKey, {
				data: priceData,
				timestamp: Date.now()
			});
		}

		return priceData;
	}

	/**
	 * Get price from DexScreener
	 */
	private async getDexScreenerPrice(
		tokenAddress: string
	): Promise<number | null> {
		const response = await fetch(
			`${DEXSCREENER_BASE_URL}/dex/tokens/${tokenAddress}`,
			{
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();

		// Find the best pair (highest liquidity)
		const pairs = data.pairs || [];
		const bestPair = pairs
			.filter(
				(pair: any) => pair.priceUsd && parseFloat(pair.priceUsd) > 0
			)
			.sort(
				(a: any, b: any) =>
					parseFloat(b.liquidity?.usd || "0") -
					parseFloat(a.liquidity?.usd || "0")
			)[0];

		return bestPair ? parseFloat(bestPair.priceUsd) : null;
	}

	/**
	 * Get price from CoinGecko
	 */
	private async getCoinGeckoPrice(
		tokenAddress: string
	): Promise<number | null> {
		if (!COINGECKO_API_KEY) return null;

		const response = await fetch(
			`${COINGECKO_BASE_URL}/simple/token_price/binance-smart-chain?contract_addresses=${tokenAddress}&vs_currencies=usd`,
			{
				headers: {
					Accept: "application/json",
					"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
				}
			}
		);

		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status}`);
		}

		const data = await response.json();
		const priceData = data[tokenAddress.toLowerCase()];

		return priceData?.usd || null;
	}

	/**
	 * Get multiple token prices efficiently
	 */
	async getMultipleTokenPrices(
		symbols: string[]
	): Promise<Map<string, TokenPriceData>> {
		const results = new Map<string, TokenPriceData>();

		// Get token metadata for all symbols
		const tokenMetadataPromises = symbols.map(async (symbol) => {
			const metadata = await this.getTokenAddress(symbol);
			return { symbol, metadata };
		});

		const tokenMetadataResults = await Promise.allSettled(
			tokenMetadataPromises
		);
		const validTokens = tokenMetadataResults
			.filter(
				(
					result
				): result is PromiseFulfilledResult<{
					symbol: string;
					metadata: TokenMetadata | null;
				}> =>
					result.status === "fulfilled" &&
					result.value.metadata !== null
			)
			.map((result) => ({
				symbol: result.value.symbol,
				metadata: result.value.metadata!
			}));

		// Batch request to Lemon Oracle
		if (validTokens.length > 0) {
			try {
				const requests: PriceRequest[] = validTokens.map(
					({ metadata }) => ({
						tokenAddress: metadata.address
					})
				);

				const oracleResponse = await this.lemonClient.getMultiplePrices(
					requests
				);

				if (oracleResponse.success && oracleResponse.data) {
					oracleResponse.data.forEach((aggregatedPrice, index) => {
						const token = validTokens[index];
						if (token) {
							const bestPrice =
								this.lemonClient.getBestPrice(aggregatedPrice);
							if (bestPrice) {
								results.set(token.symbol.toUpperCase(), {
									tokenAddress: token.metadata.address,
									symbol: token.symbol.toUpperCase(),
									priceUSD:
										bestPrice.priceUSD || bestPrice.price,
									priceNative: bestPrice.price,
									timestamp: Date.now(),
									source: "lemon-oracle",
									confidence: "high",
									dexPrices: aggregatedPrice.prices
										.filter((p) => p.success)
										.map((p) => ({
											dex: p.dex,
											price: p.priceUSD || p.price,
											liquidity: p.liquidity
										}))
								});
							}
						}
					});
				}
			} catch (error) {
				console.warn("Batch oracle request failed:", error);
			}
		}

		// Fallback for tokens that don't have oracle prices
		const missingSymbols = symbols.filter(
			(symbol) => !results.has(symbol.toUpperCase())
		);

		if (missingSymbols.length > 0) {
			const fallbackPromises = missingSymbols.map((symbol) =>
				this.getTokenPrice(symbol)
			);
			const fallbackResults = await Promise.allSettled(fallbackPromises);

			fallbackResults.forEach((result, index) => {
				if (result.status === "fulfilled" && result.value) {
					results.set(
						missingSymbols[index].toUpperCase(),
						result.value
					);
				}
			});
		}

		return results;
	}

	/**
	 * Calculate PnL for a position using current market price
	 */
	async calculatePositionPnL(
		tokenSymbol: string,
		entryPrice: string,
		margin: string,
		leverage: string,
		isLong: boolean,
		liquidationPrice: string
	): Promise<PnLCalculation | null> {
		const priceData = await this.getTokenPrice(tokenSymbol);

		if (!priceData) {
			console.warn(`Could not get price for ${tokenSymbol}`);
			return null;
		}

		const currentPrice = parseFloat(priceData.priceUSD);
		const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));
		const marginValue = parseFloat(margin.replace(/[\$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));

		if (
			currentPrice === 0 ||
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
		const currentValue = tokenAmount * currentPrice;

		// Calculate PnL
		const priceChange = currentPrice - entryPriceValue;
		const pnlMultiplier = isLong ? 1 : -1;
		const unrealizedPnL =
			(priceChange / entryPriceValue) * totalExposure * pnlMultiplier;
		const unrealizedPnLPercentage = (unrealizedPnL / marginValue) * 100;

		return {
			currentPrice: currentPrice.toString(),
			entryPrice: entryPriceValue.toString(),
			isLong,
			margin: marginValue,
			leverage: leverageValue,
			unrealizedPnL,
			unrealizedPnLPercentage,
			liquidationPrice,
			tokenAmount,
			currentValue
		};
	}

	/**
	 * Get portfolio value for multiple positions
	 */
	async calculatePortfolioValue(
		positions: Array<{
			tokenSymbol: string;
			margin: string;
			leverage: string;
			entryPrice: string;
			isLong: boolean;
		}>
	): Promise<{
		totalValue: number;
		totalPnL: number;
		positions: Array<{
			tokenSymbol: string;
			currentPrice: string;
			unrealizedPnL: number;
			currentValue: number;
		}>;
	}> {
		const uniqueSymbols = [...new Set(positions.map((p) => p.tokenSymbol))];
		const priceMap = await this.getMultipleTokenPrices(uniqueSymbols);

		let totalValue = 0;
		let totalPnL = 0;
		const positionResults = [];

		for (const position of positions) {
			const priceData = priceMap.get(position.tokenSymbol.toUpperCase());

			if (priceData) {
				const pnlCalc = await this.calculatePositionPnL(
					position.tokenSymbol,
					position.entryPrice,
					position.margin,
					position.leverage,
					position.isLong,
					"0" // liquidationPrice not needed for this calculation
				);

				if (pnlCalc) {
					totalValue += pnlCalc.currentValue;
					totalPnL += pnlCalc.unrealizedPnL;

					positionResults.push({
						tokenSymbol: position.tokenSymbol,
						currentPrice: pnlCalc.currentPrice,
						unrealizedPnL: pnlCalc.unrealizedPnL,
						currentValue: pnlCalc.currentValue
					});
				}
			}
		}

		return {
			totalValue,
			totalPnL,
			positions: positionResults
		};
	}

	/**
	 * Get real-time price updates for trading interface
	 */
	startPriceStream(
		symbols: string[],
		onUpdate: (updates: Map<string, TokenPriceData>) => void,
		onError?: (error: Error) => void
	): string {
		return this.lemonClient.startPriceStream(
			{
				tokenAddresses: [], // Will be populated after getting token addresses
				interval: 5000,
				includeUSD: true
			},
			(update) => {
				// Convert stream update to our format
				// This would need the symbol mapping
			},
			onError
		);
	}

	/**
	 * Stop price streaming
	 */
	stopPriceStream(streamId: string): boolean {
		return this.lemonClient.stopPriceStream(streamId);
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.priceCache.clear();
		this.lemonClient.clearClientCache();
	}

	/**
	 * Destroy the service and clean up resources
	 */
	destroy(): void {
		this.lemonClient.destroy();
		this.priceCache.clear();
	}
}

// Singleton instance
let tokenPriceServiceInstance: TokenPriceService | null = null;

export function getTokenPriceService(): TokenPriceService {
	if (!tokenPriceServiceInstance) {
		tokenPriceServiceInstance = new TokenPriceService();
	}
	return tokenPriceServiceInstance;
}

// Convenience functions
export async function getTokenPrice(
	symbol: string
): Promise<TokenPriceData | null> {
	return getTokenPriceService().getTokenPrice(symbol);
}

export async function calculatePositionPnL(
	tokenSymbol: string,
	entryPrice: string,
	margin: string,
	leverage: string,
	isLong: boolean,
	liquidationPrice: string = "0"
): Promise<PnLCalculation | null> {
	return getTokenPriceService().calculatePositionPnL(
		tokenSymbol,
		entryPrice,
		margin,
		leverage,
		isLong,
		liquidationPrice
	);
}
