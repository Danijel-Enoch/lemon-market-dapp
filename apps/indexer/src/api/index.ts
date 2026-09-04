import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { and, asc, client, desc, eq, graphql, gte, inArray, sql } from "ponder";

/**
 * The read API.
 *
 * The web app never queries a venue directly for anything historical — every
 * number it shows about a vault comes from here, which means every number it
 * shows came from an event someone else can replay. GraphQL and the SQL client
 * are mounted alongside for anyone who wants to check the app's arithmetic
 * against the same rows.
 */
const app = new Hono();

app.use("/graphql", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));

const JSON_HEADERS = { "cache-control": "public, max-age=5" };

/**
 * Narrow a path or query parameter to an address.
 *
 * Validating rather than casting. The hex columns are typed `0x${string}`, so a
 * cast would silence the compiler and then hand Postgres whatever a caller put
 * in the URL — this returns null on anything that is not an address, and the
 * route answers 400.
 */
function asAddress(raw: string | undefined): `0x${string}` | null {
	if (!raw) return null;
	const lower = raw.trim().toLowerCase();
	return /^0x[0-9a-f]{40}$/.test(lower) ? (lower as `0x${string}`) : null;
}

/** `bigint` does not survive `JSON.stringify`, and a silent throw here reads as a 500. */
function serialise<T>(value: T): T {
	return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

// ---------------------------------------------------------------------------
// Yield
// ---------------------------------------------------------------------------

const DAY = 86_400;

/**
 * Realised yield over a window, annualised from the share price at each end.
 *
 * Share price rather than total assets, deliberately: assets move when people
 * deposit and withdraw, and a vault that doubled its TVL overnight would
 * otherwise advertise a 36,500% APY. Price per share moves only on the position's
 * own performance, which is the thing a prospective depositor is actually asking
 * about.
 *
 * Returns null rather than zero when there is not enough history. A new vault
 * has no yield to report, and rendering that as 0% is a claim about performance
 * where none exists.
 */
async function realisedApy(
	vaultAddress: `0x${string}`,
	windowSeconds: number,
): Promise<{ apy: number | null; from: number; to: number; samples: number } | null> {
	const since = Math.floor(Date.now() / 1000) - windowSeconds;

	const points = await db
		.select({
			timestamp: schema.navPoint.timestamp,
			pricePerShare: schema.navPoint.pricePerShare,
		})
		.from(schema.navPoint)
		.where(and(eq(schema.navPoint.vault, vaultAddress), gte(schema.navPoint.timestamp, since)))
		.orderBy(asc(schema.navPoint.timestamp));

	if (points.length < 2) return { apy: null, from: since, to: since, samples: points.length };

	const first = points[0];
	const last = points[points.length - 1];
	const elapsed = last.timestamp - first.timestamp;

	// An hour is the floor. Annualising a ten-minute sample multiplies its noise
	// by 52,000 and produces a headline figure that swings by hundreds of percent
	// between page loads.
	if (elapsed < 3600 || first.pricePerShare === 0n) {
		return { apy: null, from: first.timestamp, to: last.timestamp, samples: points.length };
	}

	const growth = Number(last.pricePerShare) / Number(first.pricePerShare);
	const periods = (365 * DAY) / elapsed;
	const apy = (growth ** periods - 1) * 100;

	return {
		// A compounded figure can overflow to Infinity on a short, volatile
		// window. Reporting null beats reporting a number that is not one.
		apy: Number.isFinite(apy) ? apy : null,
		from: first.timestamp,
		to: last.timestamp,
		samples: points.length,
	};
}

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

app.get("/vaults", async (c) => {
	const rows = await db.select().from(schema.vault).orderBy(desc(schema.vault.totalAssets));

	const withYield = await Promise.all(
		rows.map(async (v) => ({
			...v,
			apy7d: await realisedApy(v.address, 7 * DAY),
			apy30d: await realisedApy(v.address, 30 * DAY),
		})),
	);

	return c.json(serialise({ vaults: withYield }), 200, JSON_HEADERS);
});

app.get("/vaults/:address", async (c) => {
	const address = asAddress(c.req.param("address"));
	if (!address) return c.json({ error: "Not an address" }, 400);
	const [v] = await db.select().from(schema.vault).where(eq(schema.vault.address, address));
	if (!v) return c.json({ error: "No vault at that address" }, 404);

	const [apy7d, apy30d, apyAll] = await Promise.all([
		realisedApy(address, 7 * DAY),
		realisedApy(address, 30 * DAY),
		realisedApy(address, 365 * DAY),
	]);

	return c.json(serialise({ vault: v, apy7d, apy30d, apyAll }), 200, JSON_HEADERS);
});

/** The share-price series behind the chart, and behind every APY figure above. */
app.get("/vaults/:address/nav", async (c) => {
	const address = asAddress(c.req.param("address"));
	if (!address) return c.json({ error: "Not an address" }, 400);
	const days = Math.min(Number(c.req.query("days") ?? 30), 365);
	const since = Math.floor(Date.now() / 1000) - days * DAY;

	const points = await db
		.select()
		.from(schema.navPoint)
		.where(and(eq(schema.navPoint.vault, address), gte(schema.navPoint.timestamp, since)))
		.orderBy(asc(schema.navPoint.timestamp))
		.limit(5000);

	return c.json(serialise({ points }), 200, JSON_HEADERS);
});

// ---------------------------------------------------------------------------
// The public activity feed
// ---------------------------------------------------------------------------

/**
 * Everything the agent did, newest first, across every chain.
 *
 * Open to anyone with no address filter and no key. A vault that moves user
 * money between three chains and shows the trail only to the person whose money
 * it is has not published anything — the point is that a stranger can audit it.
 */
app.get("/vaults/:address/activity", async (c) => {
	const address = asAddress(c.req.param("address"));
	if (!address) return c.json({ error: "Not an address" }, 400);
	const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
	const before = c.req.query("before");
	const kind = c.req.query("kind");
	const chain = c.req.query("chain");

	const filters = [eq(schema.activity.vault, address)];
	if (before) filters.push(sql`${schema.activity.sequence} < ${BigInt(before)}`);
	if (kind !== undefined && kind !== "") filters.push(eq(schema.activity.kind, Number(kind)));
	if (chain !== undefined && chain !== "") filters.push(eq(schema.activity.chain, Number(chain)));

	const rows = await db
		.select()
		.from(schema.activity)
		.where(and(...filters))
		.orderBy(desc(schema.activity.sequence))
		.limit(limit);

	const next = rows.length === limit ? rows[rows.length - 1].sequence.toString() : null;
	return c.json(serialise({ activity: rows, nextCursor: next }), 200, JSON_HEADERS);
});

/** The same feed across every vault — the protocol-wide ledger. */
app.get("/activity", async (c) => {
	const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
	const rows = await db
		.select()
		.from(schema.activity)
		.orderBy(desc(schema.activity.reportedAt), desc(schema.activity.sequence))
		.limit(limit);
	return c.json(serialise({ activity: rows }), 200, JSON_HEADERS);
});

/** Capital crossing the vault boundary — the other half of the money trail. */
app.get("/vaults/:address/transfers", async (c) => {
	const address = asAddress(c.req.param("address"));
	if (!address) return c.json({ error: "Not an address" }, 400);
	const rows = await db
		.select()
		.from(schema.agentTransfer)
		.where(eq(schema.agentTransfer.vault, address))
		.orderBy(desc(schema.agentTransfer.timestamp))
		.limit(100);
	return c.json(serialise({ transfers: rows }), 200, JSON_HEADERS);
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** One address's holdings, queue state and history across every vault. */
app.get("/portfolio/:owner", async (c) => {
	const owner = asAddress(c.req.param("owner"));
	if (!owner) return c.json({ error: "Not an address" }, 400);

	const [positions, requests, flows] = await Promise.all([
		db.select().from(schema.position).where(eq(schema.position.owner, owner)),
		db.select().from(schema.redeemRequest).where(eq(schema.redeemRequest.controller, owner)),
		db
			.select()
			.from(schema.flow)
			.where(eq(schema.flow.owner, owner))
			.orderBy(desc(schema.flow.timestamp))
			.limit(100),
	]);

	const addresses = new Set([...positions.map((p) => p.vault), ...requests.map((r) => r.vault)]);
	const vaults = addresses.size
		? await db
				.select()
				.from(schema.vault)
				.where(inArray(schema.vault.address, [...addresses]))
		: [];

	const byAddress = new Map(vaults.map((v) => [v.address, v]));

	const holdings = positions
		.filter((p) => p.shares > 0n)
		.map((p) => {
			const v = byAddress.get(p.vault);
			// Value the shares here rather than storing it: the price moves on
			// every NAV report, and a stored value would be stale the moment the
			// agent reported anything.
			const valueUsd = v ? (p.shares * v.pricePerShare) / 10n ** 18n : 0n;
			return { ...p, vault: v ?? { address: p.vault }, valueUsd };
		});

	return c.json(
		serialise({
			holdings,
			pendingWithdrawals: requests.filter((r) => r.pendingShares > 0n || r.claimableShares > 0n),
			history: flows,
		}),
		200,
		JSON_HEADERS,
	);
});

// ---------------------------------------------------------------------------
// The agent's own work queue
// ---------------------------------------------------------------------------

/**
 * Requests the agent may now fulfil, oldest first.
 *
 * The agent could scan the chain for this itself; serving it from the index
 * means it does not have to, and means the same list is visible to everyone —
 * so "the agent is late on a withdrawal" is a claim anyone can check rather than
 * something only the operator can see.
 */
app.get("/queue", async (c) => {
	const now = Math.floor(Date.now() / 1000);
	const vaultAddress = asAddress(c.req.query("vault"));

	const filters = [sql`${schema.redeemRequest.pendingShares} > 0`];
	if (vaultAddress) filters.push(eq(schema.redeemRequest.vault, vaultAddress));

	const rows = await db
		.select()
		.from(schema.redeemRequest)
		.where(and(...filters))
		.orderBy(asc(schema.redeemRequest.eligibleAt))
		.limit(500);

	return c.json(
		serialise({
			now,
			ripe: rows.filter((r) => r.eligibleAt <= now),
			waiting: rows.filter((r) => r.eligibleAt > now),
			overdue: rows.filter((r) => r.fulfillBy < now),
		}),
		200,
		JSON_HEADERS,
	);
});

// ---------------------------------------------------------------------------
// Protocol totals
// ---------------------------------------------------------------------------

app.get("/stats", async (c) => {
	const vaults = await db.select().from(schema.vault);

	const totals = vaults.reduce(
		(acc, v) => ({
			tvl: acc.tvl + v.totalAssets,
			deployed: acc.deployed + v.deployedAssets,
			idle: acc.idle + v.idleAssets,
			lifetimeDeposited: acc.lifetimeDeposited + v.lifetimeDeposited,
			lifetimeWithdrawn: acc.lifetimeWithdrawn + v.lifetimeWithdrawn,
			lifetimeFeeShares: acc.lifetimeFeeShares + v.lifetimeFeeShares,
			cumulativeNotional: acc.cumulativeNotional + v.cumulativeNotional,
			cumulativeVenueFees: acc.cumulativeVenueFees + v.cumulativeVenueFees,
			pendingRedeemShares: acc.pendingRedeemShares + v.totalPendingRedeemShares,
			depositors: acc.depositors + v.depositorCount,
			activity: acc.activity + v.activityCount,
		}),
		{
			tvl: 0n,
			deployed: 0n,
			idle: 0n,
			lifetimeDeposited: 0n,
			lifetimeWithdrawn: 0n,
			lifetimeFeeShares: 0n,
			cumulativeNotional: 0n,
			cumulativeVenueFees: 0n,
			pendingRedeemShares: 0n,
			depositors: 0,
			activity: 0,
		},
	);

	// Fee shares are shares, not dollars. Valuing them at each vault's own price
	// is the only way to add them up — a share of a vault at 1.02 is not worth
	// the same as a share of one at 0.98.
	const feeValueUsd = vaults.reduce(
		(sum, v) => sum + (v.lifetimeFeeShares * v.pricePerShare) / 10n ** 18n,
		0n,
	);

	const now = Math.floor(Date.now() / 1000);
	const queue = await db
		.select()
		.from(schema.redeemRequest)
		.where(sql`${schema.redeemRequest.pendingShares} > 0`);

	const perVault = await Promise.all(
		vaults.map(async (v) => ({
			address: v.address,
			ticker: v.ticker,
			riskTier: v.riskTier,
			totalAssets: v.totalAssets,
			pricePerShare: v.pricePerShare,
			depositorCount: v.depositorCount,
			apy30d: await realisedApy(v.address, 30 * DAY),
		})),
	);

	return c.json(
		serialise({
			...totals,
			feeValueUsd,
			vaultCount: vaults.length,
			conservativeCount: vaults.filter((v) => v.riskTier === 0).length,
			leveragedCount: vaults.filter((v) => v.riskTier === 1).length,
			// The queue's health, which is the number an operator is judged on.
			queue: {
				pending: queue.length,
				ripe: queue.filter((r) => r.eligibleAt <= now).length,
				overdue: queue.filter((r) => r.fulfillBy < now).length,
			},
			staleVaults: vaults.filter(
				(v) => v.lastNavReportAt !== null && now - v.lastNavReportAt > 6 * 3600,
			).length,
			pausedVaults: vaults.filter((v) => v.paused).length,
			vaults: perVault,
		}),
		200,
		JSON_HEADERS,
	);
});

export default app;
