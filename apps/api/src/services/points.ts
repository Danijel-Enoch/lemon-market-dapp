import { requestJson } from "@lemon/core";
import { isDatabaseConfigured, prisma } from "@lemon/db";
import { computePoints, type PointsBreakdown, tierFor, volumePoints } from "@lemon/registry";
import { TtlCache } from "../cache";
import { config } from "../config";

const AVANTIS_HISTORY_URL = "https://api.avantisfi.com";

/**
 * Verify a transaction actually happened before it earns anything.
 *
 * The app only builds calldata — the user's wallet submits it — so the server
 * never observes a swap directly. A client could therefore claim any volume it
 * liked. Every points-earning transaction is checked against the chain: it must
 * exist, have succeeded, and have been sent by the address claiming it.
 */
async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
	try {
		const response = await fetch(config.baseRpcUrl, {
			method: "POST",
			headers: { "content-type": "application/json", "user-agent": "lemon-markets" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		});
		const body = (await response.json()) as { result?: T };
		return body.result ?? null;
	} catch {
		return null;
	}
}

export type VerifyResult =
	| { ok: true; blockNumber: number; target: string }
	| { ok: false; reason: string };

export async function verifyTransaction(
	txHash: string,
	claimedSender: string,
): Promise<VerifyResult> {
	const receipt = await rpc<{
		from: string;
		to: string | null;
		status: string;
		blockNumber: string;
	}>("eth_getTransactionReceipt", [txHash]);

	if (!receipt) return { ok: false, reason: "Transaction not found or not yet mined." };
	if (receipt.status !== "0x1") return { ok: false, reason: "Transaction reverted." };

	// The sender is the load-bearing check: without it anyone could claim
	// someone else's swap by quoting its hash.
	if (receipt.from.toLowerCase() !== claimedSender.toLowerCase()) {
		return { ok: false, reason: "Transaction was not sent by this address." };
	}

	return {
		ok: true,
		blockNumber: Number.parseInt(receipt.blockNumber, 16),
		target: receipt.to ?? "",
	};
}

export interface RecordResult {
	awarded: number;
	duplicate: boolean;
	reason?: string;
}

/**
 * Record a verified, points-earning action.
 *
 * Idempotent on `txHash` — a unique constraint means a replayed hash is
 * rejected by the database rather than double-counted, which is safer than
 * checking first and racing between the check and the insert.
 */
export async function recordEvent(params: {
	userAddress: string;
	source: "SPOT_VOLUME" | "CARRY_OPENED" | "BASKET_ENTRY";
	volumeUsd?: number;
	txHash: string;
}): Promise<RecordResult> {
	const verification = await verifyTransaction(params.txHash, params.userAddress);
	if (!verification.ok) return { awarded: 0, duplicate: false, reason: verification.reason };

	const points =
		params.source === "SPOT_VOLUME"
			? volumePoints(params.volumeUsd ?? 0)
			: params.source === "CARRY_OPENED"
				? 250
				: 100;

	try {
		await prisma.pointsEvent.create({
			data: {
				userAddress: params.userAddress.toLowerCase(),
				source: params.source,
				volumeUsd: params.volumeUsd ?? 0,
				points,
				txHash: params.txHash.toLowerCase(),
				blockNumber: verification.blockNumber,
				target: verification.target,
			},
		});
		return { awarded: points, duplicate: false };
	} catch (error) {
		// Unique violation on txHash — already counted.
		if ((error as { code?: string }).code === "P2002") {
			return { awarded: 0, duplicate: true };
		}
		throw error;
	}
}

/**
 * Perp volume for an address, straight from Avantis.
 *
 * Read from the protocol rather than recorded by us: perp orders are submitted
 * gaslessly by the Avantis operator, so we never see their transactions at all,
 * and this is settled on-chain history rather than anything a client asserts.
 */
const perpVolumeCache = new TtlCache<Map<string, number>>(async () => new Map(), 60_000);

export async function getPerpVolume(trader: string): Promise<number> {
	const cache = await perpVolumeCache.get();
	const key = trader.toLowerCase();
	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	const response = await requestJson<{ data?: { totalSize?: number }[] | { totalSize?: number } }>(
		"avantis-history",
		AVANTIS_HISTORY_URL,
		`/v1/history/portfolio/total-size/${trader}`,
		{ timeoutMs: 15_000 },
	).catch(() => null);

	const raw = response?.data;
	const total = Array.isArray(raw)
		? raw.reduce((sum, row) => sum + (row.totalSize ?? 0), 0)
		: (raw?.totalSize ?? 0);

	cache.set(key, total);
	return total;
}

export interface PointsProfile extends PointsBreakdown {
	address: string;
	tier: string;
	rank: number | null;
}

export async function getProfile(address: string): Promise<PointsProfile> {
	const key = address.toLowerCase();

	const [events, carries, perpVolumeUsd] = await Promise.all([
		isDatabaseConfigured()
			? prisma.pointsEvent.groupBy({
					by: ["source"],
					where: { userAddress: key },
					_sum: { volumeUsd: true },
					_count: { _all: true },
				})
			: Promise.resolve([]),
		isDatabaseConfigured()
			? prisma.carryPosition.count({
					where: { userAddress: key, status: { in: ["OPEN", "UNWINDING", "CLOSED"] } },
				})
			: Promise.resolve(0),
		getPerpVolume(address).catch(() => 0),
	]);

	const bySource = new Map(events.map((row) => [row.source, row]));
	const spotVolumeUsd = bySource.get("SPOT_VOLUME")?._sum.volumeUsd ?? 0;
	const basketEntries = bySource.get("BASKET_ENTRY")?._count._all ?? 0;

	const breakdown = computePoints({
		perpVolumeUsd,
		spotVolumeUsd,
		carriesOpened: carries,
		basketEntries,
	});

	return { ...breakdown, address: key, tier: tierFor(breakdown.total).name, rank: null };
}

export interface LeaderboardRow {
	rank: number;
	address: string;
	points: number;
	tier: string;
	spotVolumeUsd: number;
	perpVolumeUsd: number;
	carriesOpened: number;
}

/**
 * Ranked points for everyone who has traded through this app.
 *
 * Perp volume is fetched per address, so the board is capped rather than
 * unbounded — a leaderboard nobody reads past row 100 is not worth N hundred
 * upstream calls.
 */
export async function getLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
	if (!isDatabaseConfigured()) return [];

	const [eventAddresses, carryAddresses] = await Promise.all([
		prisma.pointsEvent.groupBy({
			by: ["userAddress"],
			_sum: { volumeUsd: true, points: true },
		}),
		prisma.carryPosition.groupBy({
			by: ["userAddress"],
			where: { status: { in: ["OPEN", "UNWINDING", "CLOSED"] } },
			_count: { _all: true },
		}),
	]);

	const addresses = new Set([
		...eventAddresses.map((row) => row.userAddress),
		...carryAddresses.map((row) => row.userAddress),
	]);

	const spotBy = new Map(eventAddresses.map((row) => [row.userAddress, row._sum.volumeUsd ?? 0]));
	const carryBy = new Map(carryAddresses.map((row) => [row.userAddress, row._count._all]));

	const rows = await Promise.all(
		Array.from(addresses).map(async (address) => {
			const perpVolumeUsd = await getPerpVolume(address).catch(() => 0);
			const spotVolumeUsd = spotBy.get(address) ?? 0;
			const carriesOpened = carryBy.get(address) ?? 0;
			const breakdown = computePoints({
				perpVolumeUsd,
				spotVolumeUsd,
				carriesOpened,
				basketEntries: 0,
			});
			return {
				address,
				points: breakdown.total,
				tier: tierFor(breakdown.total).name,
				spotVolumeUsd,
				perpVolumeUsd,
				carriesOpened,
			};
		}),
	);

	return rows
		.sort((a, b) => b.points - a.points)
		.slice(0, limit)
		.map((row, index) => ({ rank: index + 1, ...row }));
}

export interface GlobalLeaderboardRow {
	rank: number;
	trader: string;
	volumeUsd: number;
	trades: number;
	winRatePercent: number;
	pnlUsd: number;
}

/**
 * Avantis' own protocol-wide leaderboard.
 *
 * Shown alongside ours and labelled as such — it ranks every Avantis trader by
 * realised PnL, not activity through this app, so presenting the two as one
 * board would misrepresent both.
 */
const globalCache = new TtlCache<GlobalLeaderboardRow[]>(async () => {
	const response = await requestJson<{
		leaderBoard?: {
			trader: string;
			rank: number;
			totalPositionSizes: number;
			totalTrades: number;
			winRate: number;
			totalProfits: number;
		}[];
	}>("avantis-history", AVANTIS_HISTORY_URL, "/v1/history/portfolio/leader-board", {
		timeoutMs: 15_000,
	});

	return (response.leaderBoard ?? []).map((row) => ({
		rank: row.rank,
		trader: row.trader,
		volumeUsd: row.totalPositionSizes ?? 0,
		trades: row.totalTrades ?? 0,
		winRatePercent: (row.winRate ?? 0) * 100,
		pnlUsd: row.totalProfits ?? 0,
	}));
}, 5 * 60_000);

export function getGlobalLeaderboard(): Promise<GlobalLeaderboardRow[]> {
	return globalCache.get().catch(() => []);
}
