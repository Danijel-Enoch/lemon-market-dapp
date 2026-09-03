import { isDatabaseConfigured, prisma } from "@lemon/db";
import { computePoints, type PointsBreakdown, tierFor, volumePoints } from "@lemon/registry";
import { config } from "../config";

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
 * Record perp volume from an order this server placed.
 *
 * Not verified against a chain transaction, because there is no chain
 * transaction: a Pacifica order is an API call this process made itself with
 * the user's agent key. That makes it a stronger source than reading volume
 * back from a venue's own history endpoint — but it does mean the caller must
 * be the order path, never a client report.
 *
 * The order id doubles as the idempotency key: `txHash` is unique, so a retried
 * or replayed record cannot award points twice.
 */
export async function recordPerpVolume(params: {
	userAddress: string;
	volumeUsd: number;
	orderId: number | string;
}): Promise<void> {
	if (!isDatabaseConfigured() || params.volumeUsd <= 0) return;

	await prisma.pointsEvent
		.create({
			data: {
				userAddress: params.userAddress.toLowerCase(),
				source: "PERP_VOLUME",
				volumeUsd: params.volumeUsd,
				points: volumePoints(params.volumeUsd),
				txHash: `pacifica:${params.orderId}`,
			},
		})
		// A duplicate order id is the idempotent case, not an error worth
		// failing an already-placed order over.
		.catch(() => undefined);
}

export interface PointsProfile extends PointsBreakdown {
	address: string;
	tier: string;
	rank: number | null;
}

export async function getProfile(address: string): Promise<PointsProfile> {
	const key = address.toLowerCase();

	const [events, carries] = await Promise.all([
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
	]);

	const bySource = new Map(events.map((row) => [row.source, row]));
	const spotVolumeUsd = bySource.get("SPOT_VOLUME")?._sum.volumeUsd ?? 0;
	const perpVolumeUsd = bySource.get("PERP_VOLUME")?._sum.volumeUsd ?? 0;
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
 * Every figure now comes from our own recorded events, so the board is a
 * couple of grouped queries rather than one upstream call per address.
 */
export async function getLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
	if (!isDatabaseConfigured()) return [];

	const [eventAddresses, carryAddresses] = await Promise.all([
		prisma.pointsEvent.groupBy({
			by: ["userAddress", "source"],
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

	const volumeBy = new Map<string, { spot: number; perp: number }>();
	for (const row of eventAddresses) {
		const entry = volumeBy.get(row.userAddress) ?? { spot: 0, perp: 0 };
		if (row.source === "SPOT_VOLUME") entry.spot += row._sum.volumeUsd ?? 0;
		if (row.source === "PERP_VOLUME") entry.perp += row._sum.volumeUsd ?? 0;
		volumeBy.set(row.userAddress, entry);
	}
	const carryBy = new Map(carryAddresses.map((row) => [row.userAddress, row._count._all]));

	const rows = await Promise.all(
		Array.from(addresses).map(async (address) => {
			const perpVolumeUsd = volumeBy.get(address)?.perp ?? 0;
			const spotVolumeUsd = volumeBy.get(address)?.spot ?? 0;
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
