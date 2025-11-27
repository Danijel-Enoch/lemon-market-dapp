import { betterFetch } from "@better-fetch/fetch";
import useAsyncFn from "react-use/lib/useAsyncFn";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Type definitions based on API schemas
export interface PositionsQueryRequest {
	trader?: string;
	tokenSymbol?: string;
	status?: "OPEN" | "CLOSED" | "LIQUIDATED";
	isLong?: boolean;
	limit?: number;
	offset?: number;
}

export interface OpenPositionRequest {
	marketId: string;
	isLong: boolean;
	margin: string;
	leverage: number;
	userAddress: string;
	referrer?: string;
}

export interface ClosePositionRequest {
	positionId: number;
	marketId: string;
	userAddress: string;
}

export interface ApproveRequest {
	userAddress: string;
	amount: string;
}

export interface GenericApproveRequest {
	userAddress: string;
	spenderAddress: string;
	amount: string;
}

export interface DecodeErrorRequest {
	errorData: string;
}

export interface VerifySignatureRequest {
	marketId: string;
	userAddress: string;
	isLong: boolean;
	margin: string;
	leverage: number;
}

export interface AnalyzeTransactionRequest {
	calldata: string;
	userAddress: string;
	contractAddress: string;
}

export interface MarketsSearchRequest {
	limit?: number;
	skip?: number;
}

// Response types for stricter typing
export interface HealthResponse {
	status: string;
}

export interface Position {
	id: number;
	trader: string;
	tokenSymbol: string;
	isLong: boolean;
	status: "OPEN" | "CLOSED" | "LIQUIDATED";
	margin: string;
	leverage: number;
	// Add more fields as needed based on actual API
}

export interface Market {
	id: string;
	// Add more fields as needed
}

export interface SupportedChainsResponse {
	chains: string[];
}

export interface CustomErrorsResponse {
	errors: Record<string, string>;
}

export interface DecodeErrorResponse {
	error: string;
	description: string;
}

export interface VerifySignatureResponse {
	valid: boolean;
}

export interface SignerInfoResponse {
	address: string;
}

export interface AnalyzeTransactionResponse {
	result: string;
}

export interface MarketsStatsResponse {
	totalMarkets: number;
	// Add more
}

export interface DocsResponse {
	url: string;
}

export function useMarketApi() {
	// Root
	const [indexState, getIndex] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/`, {
			method: "GET",
		});
		return data;
	});

	// Health
	const [healthState, getHealth] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/health`, {
			method: "GET",
		});
		return data;
	});

	// Positions
	const [positionsHealthState, getPositionsHealth] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/health`, {
			method: "GET",
		});
		return data;
	});

	const [positionByIdState, getPositionById] = useAsyncFn(async (positionId: string) => {
		const { data } = await betterFetch(`${BASE_URL}/positions/${positionId}`, {
			method: "GET",
		});
		return data;
	});

	const [queryPositionsState, queryPositions] = useAsyncFn(
		async (params: PositionsQueryRequest) => {
			const { data } = await betterFetch(`${BASE_URL}/positions/query`, {
				method: "POST",
				body: JSON.stringify(params),
				headers: { "Content-Type": "application/json" },
			});
			return data;
		},
	);

	const [positionsByTraderState, getPositionsByTrader] = useAsyncFn(
		async (traderAddress: string) => {
			const { data } = await betterFetch(`${BASE_URL}/positions/trader/${traderAddress}`, {
				method: "GET",
			});
			return data;
		},
	);

	const [positionsByTokenState, getPositionsByToken] = useAsyncFn(async (tokenSymbol: string) => {
		const { data } = await betterFetch(`${BASE_URL}/positions/token/${tokenSymbol}`, {
			method: "GET",
		});
		return data;
	});

	const [openPositionsState, getOpenPositions] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/status/open`, {
			method: "GET",
		});
		return data;
	});

	const [closedPositionsState, getClosedPositions] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/status/closed`, {
			method: "GET",
		});
		return data;
	});

	const [liquidatedPositionsState, getLiquidatedPositions] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/status/liquidated`, {
			method: "GET",
		});
		return data;
	});

	const [openPositionState, openPosition] = useAsyncFn(async (data: OpenPositionRequest) => {
		const { data: responseData } = await betterFetch(`${BASE_URL}/positions/open`, {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		return responseData;
	});

	const [closePositionState, closePosition] = useAsyncFn(async (data: ClosePositionRequest) => {
		const { data: responseData } = await betterFetch(`${BASE_URL}/positions/close`, {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		return responseData;
	});

	const [openWithDevFeeState, openWithDevFee] = useAsyncFn(
		async (data: OpenPositionRequest & { devFeeRecipient: string; devFeeRate: number }) => {
			const { data: responseData } = await betterFetch(`${BASE_URL}/positions/open-with-dev-fee`, {
				method: "POST",
				body: JSON.stringify(data),
				headers: { "Content-Type": "application/json" },
			});
			return responseData;
		},
	);

	const [closeWithDevFeeState, closeWithDevFee] = useAsyncFn(
		async (data: ClosePositionRequest & { devFeeRecipient: string; devFeeRate: number }) => {
			const { data: responseData } = await betterFetch(`${BASE_URL}/positions/close-with-dev-fee`, {
				method: "POST",
				body: JSON.stringify(data),
				headers: { "Content-Type": "application/json" },
			});
			return responseData;
		},
	);

	const [approveMarketManagerState, approveMarketManager] = useAsyncFn(
		async (data: ApproveRequest) => {
			const { data: responseData } = await betterFetch(
				`${BASE_URL}/positions/approve-market-manager`,
				{
					method: "POST",
					body: JSON.stringify(data),
					headers: { "Content-Type": "application/json" },
				},
			);
			return responseData;
		},
	);

	const [approvePositionManagerState, approvePositionManager] = useAsyncFn(
		async (data: ApproveRequest) => {
			const { data: responseData } = await betterFetch(
				`${BASE_URL}/positions/approve-position-manager`,
				{
					method: "POST",
					body: JSON.stringify(data),
					headers: { "Content-Type": "application/json" },
				},
			);
			return responseData;
		},
	);

	const [approveLiquidityProviderState, approveLiquidityProvider] = useAsyncFn(
		async (data: ApproveRequest) => {
			const { data: responseData } = await betterFetch(
				`${BASE_URL}/positions/approve-liquidity-provider`,
				{
					method: "POST",
					body: JSON.stringify(data),
					headers: { "Content-Type": "application/json" },
				},
			);
			return responseData;
		},
	);

	const [approveRouterState, approveRouter] = useAsyncFn(async (data: ApproveRequest) => {
		const { data: responseData } = await betterFetch(`${BASE_URL}/positions/approve-router`, {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		return responseData;
	});

	const [approveGenericState, approveGeneric] = useAsyncFn(async (data: GenericApproveRequest) => {
		const { data: responseData } = await betterFetch(`${BASE_URL}/positions/approve`, {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		return responseData;
	});

	const [supportedChainsState, getSupportedChains] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/supported-chains`, {
			method: "GET",
		});
		return data;
	});

	const [customErrorsState, getCustomErrors] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/debug/custom-errors`, {
			method: "GET",
		});
		return data;
	});

	const [decodeErrorState, decodeError] = useAsyncFn(async (data: DecodeErrorRequest) => {
		const { data: responseData } = await betterFetch(`${BASE_URL}/positions/debug/decode-error`, {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
		});
		return responseData;
	});

	const [verifySignatureState, verifySignature] = useAsyncFn(
		async (data: VerifySignatureRequest) => {
			const { data: responseData } = await betterFetch(
				`${BASE_URL}/positions/debug/verify-signature`,
				{
					method: "POST",
					body: JSON.stringify(data),
					headers: { "Content-Type": "application/json" },
				},
			);
			return responseData;
		},
	);

	const [signerInfoState, getSignerInfo] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/positions/debug/signer-info`, {
			method: "GET",
		});
		return data;
	});

	const [analyzeTransactionState, analyzeTransaction] = useAsyncFn(
		async (data: AnalyzeTransactionRequest) => {
			const { data: responseData } = await betterFetch(
				`${BASE_URL}/positions/debug/analyze-transaction`,
				{
					method: "POST",
					body: JSON.stringify(data),
					headers: { "Content-Type": "application/json" },
				},
			);
			return responseData;
		},
	);

	// Markets
	const [marketsState, getMarkets] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/markets/`, {
			method: "GET",
		});
		return data;
	});

	const [marketByIdState, getMarketById] = useAsyncFn(async (marketId: string) => {
		const { data } = await betterFetch(`${BASE_URL}/markets/${marketId}`, {
			method: "GET",
		});
		return data;
	});

	const [marketDetailsState, getMarketDetails] = useAsyncFn(async (marketId: string) => {
		const { data } = await betterFetch(`${BASE_URL}/markets/${marketId}/details`, {
			method: "GET",
		});
		return data;
	});

	const [searchMarketsState, searchMarkets] = useAsyncFn(async (params?: MarketsSearchRequest) => {
		const url = new URL(`${BASE_URL}/markets/search`);
		if (params?.limit) url.searchParams.set("limit", params.limit.toString());
		if (params?.skip) url.searchParams.set("skip", params.skip.toString());
		const { data } = await betterFetch(url.toString(), {
			method: "GET",
		});
		return data;
	});

	const [marketsStatsState, getMarketsStats] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/markets/stats`, {
			method: "GET",
		});
		return data;
	});

	const [marketsHealthState, getMarketsHealth] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/markets/health`, {
			method: "GET",
		});
		return data;
	});

	// Docs
	const [docsState, getDocs] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/docs`, {
			method: "GET",
		});
		return data;
	});

	const [openapiState, getOpenapi] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/openapi`, {
			method: "GET",
		});
		return data;
	});

	const [apiDocsState, getApiDocs] = useAsyncFn(async () => {
		const { data } = await betterFetch(`${BASE_URL}/api-docs`, {
			method: "GET",
		});
		return data;
	});

	return {
		index: getIndex,
		indexState,
		health: {
			get: getHealth,
			state: healthState,
		},
		positions: {
			health: {
				get: getPositionsHealth,
				state: positionsHealthState,
			},
			byId: getPositionById,
			byIdState: positionByIdState,
			query: queryPositions,
			queryState: queryPositionsState,
			trader: getPositionsByTrader,
			traderState: positionsByTraderState,
			token: getPositionsByToken,
			tokenState: positionsByTokenState,
			status: {
				open: getOpenPositions,
				openState: openPositionsState,
				closed: getClosedPositions,
				closedState: closedPositionsState,
				liquidated: getLiquidatedPositions,
				liquidatedState: liquidatedPositionsState,
			},
			open: openPosition,
			openState: openPositionState,
			close: closePosition,
			closeState: closePositionState,
			openWithDevFee: openWithDevFee,
			openWithDevFeeState: openWithDevFeeState,
			closeWithDevFee: closeWithDevFee,
			closeWithDevFeeState: closeWithDevFeeState,
			approve: {
				marketManager: approveMarketManager,
				marketManagerState: approveMarketManagerState,
				positionManager: approvePositionManager,
				positionManagerState: approvePositionManagerState,
				liquidityProvider: approveLiquidityProvider,
				liquidityProviderState: approveLiquidityProviderState,
				router: approveRouter,
				routerState: approveRouterState,
				generic: approveGeneric,
				genericState: approveGenericState,
			},
			supportedChains: getSupportedChains,
			supportedChainsState,
			debug: {
				customErrors: getCustomErrors,
				customErrorsState,
				decodeError: decodeError,
				decodeErrorState,
				verifySignature: verifySignature,
				verifySignatureState,
				signerInfo: getSignerInfo,
				signerInfoState,
				analyzeTransaction: analyzeTransaction,
				analyzeTransactionState,
			},
		},
		markets: {
			list: getMarkets,
			listState: marketsState,
			byId: getMarketById,
			byIdState: marketByIdState,
			details: getMarketDetails,
			detailsState: marketDetailsState,
			search: searchMarkets,
			searchState: searchMarketsState,
			stats: getMarketsStats,
			statsState: marketsStatsState,
			health: {
				get: getMarketsHealth,
				state: marketsHealthState,
			},
		},
		docs: getDocs,
		docsState,
		openapi: getOpenapi,
		openapiState,
		apiDocs: getApiDocs,
		apiDocsState,
	};
}
