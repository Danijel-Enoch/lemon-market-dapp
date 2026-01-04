import { betterFetch } from "@better-fetch/fetch";

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || "https://api.degenoptions.xyz";

export interface OpenPositionRequest {
	marketId: string;
	isLong: boolean;
	margin: string;
	leverage: number;
	userAddress: string;
	referrer?: string;
}

export interface SimulationResult {
	success: boolean;
	reverted?: boolean;
	revertReason?: string;
	error?: string;
}

export interface OpenPositionResponse {
	success: boolean;
	data?: {
		to: string;
		data: string;
		value: string;
		gasEstimate?: number;
	} | null;
	simulationResult?: SimulationResult;
	error?: string;
}

export async function openPosition(params: OpenPositionRequest): Promise<OpenPositionResponse> {
	const { data } = await betterFetch(`${BASE_URL}/positions/open`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as OpenPositionResponse;
}

export async function closePosition(params: {
	positionId: number;
	marketId: string;
	userAddress: string;
}) {
	const { data } = await betterFetch(`${BASE_URL}/positions/close`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data;
}
