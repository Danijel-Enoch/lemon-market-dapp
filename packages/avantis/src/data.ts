import { requestJson } from "@lemon/core";

export const DEFAULT_DATA_API_URL = "https://data.avantisfi.com";
export const TESTNET_DATA_API_URL = "https://testnet-data.avantisfi.com";

/**
 * Per-pair economics from the Avantis data service. Only the fields this app
 * uses are modelled; the upstream payload is much larger.
 */
export interface PairEconomics {
	pairIndex: number;
	symbol: string;
	/** Percent per hour. Positive = you receive, negative = you pay. */
	fundingRate: { long: number; short: number };
	openInterest: { long: number; short: number };
	openFeePercent: number;
	closeFeePercent: number;
	spreadPercent: number;
	limitOrderFeePercent: number;
	minPositionUsdc: number;
	isListed: boolean;
}

interface RawPairInfo {
	index: number;
	from: string;
	to: string;
	fundingRate?: { long: number; short: number };
	openInterest?: { long: number; short: number };
	openFeeP?: number;
	closeFeeP?: number;
	spreadP?: number;
	pairSpreadP?: number;
	limitOrderFeeP?: number;
	pairMinLevPosUSDC?: number;
	isPairListed?: boolean;
}

interface TradingSnapshot {
	dataVersion: number;
	pairInfos: Record<string, RawPairInfo>;
	pairCount: number;
	totalOi: number;
}

/**
 * Client for the Avantis data service.
 *
 * Separate host and payload from the tx-builder: the tx-builder knows how to
 * *build* orders, this knows what holding one costs. Funding rates live here,
 * which makes it the source of the cash-and-carry yield number.
 */
export class AvantisDataClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private cache: { at: number; data: Map<number, PairEconomics> } | null = null;
	/** Upstream caches this snapshot for 5s; matching that avoids hammering it. */
	private readonly ttlMs: number;

	constructor(options: { baseUrl?: string; timeoutMs?: number; ttlMs?: number } = {}) {
		this.baseUrl = options.baseUrl ?? DEFAULT_DATA_API_URL;
		this.timeoutMs = options.timeoutMs ?? 20_000;
		this.ttlMs = options.ttlMs ?? 5_000;
	}

	async getEconomics(force = false): Promise<Map<number, PairEconomics>> {
		if (!force && this.cache && Date.now() - this.cache.at < this.ttlMs) {
			return this.cache.data;
		}

		const snapshot = await requestJson<TradingSnapshot>(
			"avantis-data",
			this.baseUrl,
			"/v2/trading",
			{ timeoutMs: this.timeoutMs },
		);

		const data = new Map<number, PairEconomics>();
		for (const raw of Object.values(snapshot.pairInfos ?? {})) {
			data.set(raw.index, {
				pairIndex: raw.index,
				symbol: `${raw.from}/${raw.to}`,
				fundingRate: {
					long: raw.fundingRate?.long ?? 0,
					short: raw.fundingRate?.short ?? 0,
				},
				openInterest: {
					long: raw.openInterest?.long ?? 0,
					short: raw.openInterest?.short ?? 0,
				},
				openFeePercent: raw.openFeeP ?? 0,
				closeFeePercent: raw.closeFeeP ?? 0,
				spreadPercent: raw.pairSpreadP ?? raw.spreadP ?? 0,
				limitOrderFeePercent: raw.limitOrderFeeP ?? 0,
				minPositionUsdc: raw.pairMinLevPosUSDC ?? 0,
				isListed: raw.isPairListed !== false,
			});
		}

		this.cache = { at: Date.now(), data };
		return data;
	}

	async getPairEconomics(pairIndex: number): Promise<PairEconomics | undefined> {
		return (await this.getEconomics()).get(pairIndex);
	}
}
