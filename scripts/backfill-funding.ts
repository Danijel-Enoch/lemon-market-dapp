/**
 * Report funding the venue has paid but the vault never published.
 *
 * A basis vault has exactly one source of return, and the UI reads all of it
 * from one place: `FUNDING_SETTLED` rows in the on-chain activity feed, which
 * the indexer sums into the funding chart and the vault's cumulative total. The
 * agent emits those rows in `funding.ts` by differencing Pacifica's running
 * `funding` figure against a watermark in Postgres, once per tick.
 *
 * That works while the agent is up and has a watermark. It has no way to
 * recover anything else. The venue reports a *running total on the open
 * position*, not a ledger — so a period the agent was down for is not owed to
 * the feed later, it is simply absorbed into a total the next reading
 * differences away. Every hour the agent missed is an hour the depositor's
 * funding chart is short, permanently, and the vault under-reports what it has
 * earned. Restarting the agent does not fix it; it just resumes from the total
 * as it stands.
 *
 * Pacifica does keep the ledger, at `/funding/history` — one row per settlement
 * per market, with the payout and the hour it landed. This reconciles that
 * against what the vault has actually published and reports the difference.
 *
 * **Reading is free, writing is not.** The default is a dry run that fetches,
 * reconciles and prints. `--commit` publishes the missing rows on-chain through
 * the same `reportActivity` call the agent uses, signed by the same MPC-derived
 * agent key — so it needs the agent's NEAR credentials, and it costs gas. Read
 * the dry run before running it.
 *
 * **Idempotent by construction.** A settlement is matched to what is already
 * published by its funding period — the hour, which is the granularity the
 * agent stamps its own rows at through `fundingPeriodStart`. An hour the feed
 * already has a row for is never republished, so running this twice is a no-op
 * and running it against a healthy vault reports nothing.
 *
 * **The watermark moves too.** After publishing, the vault's `FundingWatermark`
 * is advanced to the venue's current running total. Without that, the next tick
 * would difference against a stale mark and report a second time everything
 * this just backfilled — the one way a backfill can overstate a vault's
 * earnings rather than merely fail to fix them.
 *
 * Usage:
 *   bun run scripts/backfill-funding.ts                        # every vault, dry run
 *   bun run scripts/backfill-funding.ts --vault 0x86fe…37d5    # one vault
 *   bun run scripts/backfill-funding.ts --commit               # publish the gap
 */

import { ACTIVITY_KINDS } from "@lemon/contracts";
import { fundingPeriodStart } from "@lemon/core";
import { prisma } from "@lemon/db";
import { NearMpcClient } from "@lemon/near-mpc";
import { createPublicClient, createWalletClient, http } from "viem";
import { resolveAgentChain } from "../apps/agent/src/chain";
import type { ActivityInput } from "../apps/agent/src/vault";
import { VaultClient } from "../apps/agent/src/vault";
import { agentWalletFor } from "../apps/agent/src/wallet";

const PACIFICA_URL = process.env.PACIFICA_API_URL?.trim() || "https://api.pacifica.fi/api/v1";
const INDEXER_URL = process.env.INDEXER_URL?.trim() || "http://localhost:42069";

/**
 * How many settlements to ask the venue for.
 *
 * Pacifica's funding history takes a `limit` and ignores every offset and
 * time-range parameter tried against it, so this is the whole pagination story:
 * one request, newest first. Ten thousand hours is over a year of hourly
 * settlements per market, and the script says so loudly if a response comes
 * back exactly this long — which is the only symptom a truncated history has.
 */
const HISTORY_LIMIT = 10_000;

/** One settlement, as Pacifica's ledger records it. */
interface VenueFunding {
	symbol: string;
	/** Signed payout in USD, as the venue's own decimal string. */
	payout: string;
	/** Milliseconds. The venue settles on the hour. */
	created_at: number;
}

/** One published row, as the indexer serves it back. */
interface PublishedFunding {
	occurredAt: number | string;
	pnlAssets: string;
	sequence: number | string;
}

const FUNDING_SETTLED = ACTIVITY_KINDS.indexOf("FUNDING_SETTLED");

function usdcFromDecimal(value: string): bigint {
	const negative = value.trim().startsWith("-");
	const [whole = "0", fraction = ""] = value.trim().replace("-", "").split(".");
	// Truncated rather than rounded: a payout is money the venue has already
	// moved, and rounding a sub-cent tail up would publish a figure the account
	// never received.
	const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
	return negative ? -units : units;
}

function fmtUsdc(units: bigint): string {
	const negative = units < 0n;
	const abs = negative ? -units : units;
	return `${negative ? "-" : ""}$${(Number(abs) / 1e6).toFixed(6)}`;
}

function iso(seconds: number): string {
	return new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
}

async function getJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
	return (await response.json()) as T;
}

/** Every settlement the venue has a record of, newest first. */
async function venueLedger(account: string): Promise<VenueFunding[]> {
	const body = await getJson<{ success: boolean; data: VenueFunding[] | null; error?: string }>(
		`${PACIFICA_URL}/funding/history?account=${account}&limit=${HISTORY_LIMIT}`,
	);
	if (!body.success) throw new Error(`Pacifica refused the funding history: ${body.error}`);
	const rows = body.data ?? [];
	if (rows.length >= HISTORY_LIMIT) {
		console.warn(
			`  ! the venue returned exactly ${HISTORY_LIMIT} settlements, so its history is probably truncated and anything older than the oldest row below is invisible to this script.`,
		);
	}
	return rows;
}

/**
 * Every funding row the vault has already published, by settlement hour.
 *
 * Paged through the indexer's cursor rather than taken in one request: the
 * activity endpoint caps a page at 200, and a vault that has been running for a
 * month has more funding rows than that. Stopping at the first page would read
 * the rows it did not fetch as missing and republish all of them.
 */
async function publishedByPeriod(vault: string, chainId: number): Promise<Map<number, bigint>> {
	const byPeriod = new Map<number, bigint>();
	let before: string | null = null;

	for (;;) {
		const cursor: string = before ? `&before=${before}` : "";
		const page: { activity: PublishedFunding[]; nextCursor: string | null } = await getJson(
			`${INDEXER_URL}/vaults/${vault}/activity?chainId=${chainId}&kind=${FUNDING_SETTLED}&limit=200${cursor}`,
		);

		for (const row of page.activity) {
			const period = fundingPeriodStart(Number(row.occurredAt));
			byPeriod.set(period, (byPeriod.get(period) ?? 0n) + BigInt(row.pnlAssets));
		}

		if (!page.nextCursor) return byPeriod;
		before = page.nextCursor;
	}
}

/**
 * What the venue paid, gathered into the hours the agent would have stamped.
 *
 * Summed per period rather than kept per settlement because a vault running
 * several markets is paid once per market per hour, and the agent publishes one
 * row per market — so the comparison only holds at the level both sides agree
 * on, which is the period's total.
 */
function venueByPeriod(ledger: VenueFunding[]): Map<number, bigint> {
	const byPeriod = new Map<number, bigint>();
	for (const row of ledger) {
		const period = fundingPeriodStart(Math.floor(row.created_at / 1000));
		byPeriod.set(period, (byPeriod.get(period) ?? 0n) + usdcFromDecimal(row.payout));
	}
	return byPeriod;
}

/**
 * The periods the venue paid for and the feed has nothing for.
 *
 * Deliberately not "periods where the amounts differ". A published row that
 * disagrees with the venue by a unit is a rounding difference between two
 * readings of the same payment, and republishing the hour would double it. Only
 * an hour with no row at all is a gap this can safely fill.
 */
function missingPeriods(
	venue: Map<number, bigint>,
	published: Map<number, bigint>,
): Array<{ period: number; amount: bigint }> {
	return [...venue.entries()]
		.filter(([period, amount]) => amount !== 0n && !published.has(period))
		.map(([period, amount]) => ({ period, amount }))
		.sort((a, b) => a.period - b.period);
}

/**
 * A backfilled settlement, in the shape the agent publishes.
 *
 * Two fields differ from a live row, both deliberately. `notionalAssets` is
 * zero because the venue's funding ledger does not record the mark at
 * settlement, and reconstructing it from today's price would put a number on
 * the row that was never true — the chart reads `pnlAssets` and the timestamp,
 * so nothing is lost by leaving it honest. `txRef` is empty for the same reason
 * a live funding row's is: funding has no transaction to quote.
 */
function backfillRow(ticker: string, period: number, amount: bigint): ActivityInput {
	return {
		kind: "FUNDING_SETTLED",
		chain: "SOLANA",
		symbol: ticker,
		baseAmount: 0n,
		notionalAssets: 0n,
		pnlAssets: amount,
		feeAssets: 0n,
		txRef: "0x",
		occurredAt: period,
	};
}

interface VaultRow {
	address: string;
	chainId: number;
	ticker: string;
	perpSymbol: string;
	agentPath: string;
	agentEvmAddress: string;
	agentSolanaAddress: string;
}

async function publish(vault: VaultRow, rows: ActivityInput[], accrued: bigint): Promise<void> {
	const nearAccountId = process.env.NEAR_ACCOUNT_ID?.trim();
	const nearPrivateKey = process.env.NEAR_PRIVATE_KEY?.trim();
	if (!nearAccountId || !nearPrivateKey) {
		throw new Error(
			"NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required to publish: the agent wallet is MPC-derived and there is no local key to sign with.",
		);
	}

	const mpc = new NearMpcClient({
		accountId: nearAccountId,
		privateKey: nearPrivateKey,
		rpcUrl: process.env.NEAR_RPC_URL?.trim(),
		contractId: process.env.NEAR_MPC_CONTRACT_ID?.trim(),
	});
	await mpc.verifyRootKeys();

	const chain = resolveAgentChain();
	const transport = http(chain.rpcUrls.default.http[0]);
	const publicClient = createPublicClient({ chain, transport });

	// `agentWalletFor` is given the address the vault names so a path that
	// derives to anything else fails here rather than producing a signature the
	// vault will reject — the same check the agent makes every tick.
	const wallet = agentWalletFor(mpc, vault.agentPath, vault.agentEvmAddress as `0x${string}`);
	const walletClient = createWalletClient({ account: wallet.account, chain, transport });
	const client = new VaultClient(publicClient, walletClient, vault.address as `0x${string}`);

	// Batched by `reportActivity` itself, which picks the single or the batch
	// call. Chunked here so a year of backfill does not build one transaction
	// too large to mine.
	const CHUNK = 50;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const batch = rows.slice(i, i + CHUNK);
		const hash = await client.reportActivity(batch);
		console.log(`  published ${batch.length} row(s) — ${hash}`);
	}

	// Only once the rows are on-chain. The same ordering `fundingSettlements`
	// uses and for the same reason: advancing first and failing to publish
	// consumes the payments silently, while publishing first and failing to
	// advance costs a duplicate that is at least visible.
	await prisma.fundingWatermark.upsert({
		where: {
			vaultAddress_perpSymbol: {
				vaultAddress: vault.address.toLowerCase(),
				perpSymbol: vault.perpSymbol,
			},
		},
		create: {
			vaultAddress: vault.address.toLowerCase(),
			perpSymbol: vault.perpSymbol,
			accruedUsdc: accrued.toString(),
			positionOpenedAt: 0,
			updatedAt: new Date(),
		},
		update: { accruedUsdc: accrued.toString(), updatedAt: new Date() },
	});
	console.log(`  watermark advanced to ${fmtUsdc(accrued)} of accrued funding`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const commit = args.includes("--commit");
	const only = args[args.indexOf("--vault") + 1];
	const wanted = args.includes("--vault") ? only?.toLowerCase() : undefined;

	const vaults = (await prisma.vaultConfig.findMany({
		where: wanted ? { address: wanted } : undefined,
		orderBy: { ticker: "asc" },
	})) as unknown as VaultRow[];

	if (vaults.length === 0) {
		console.log(wanted ? `No vault configured at ${wanted}.` : "No vaults configured.");
		return;
	}

	console.log(
		commit
			? `Publishing missing funding for ${vaults.length} vault(s).`
			: `Dry run over ${vaults.length} vault(s). Nothing is published; pass --commit to publish.`,
	);

	let gapTotal = 0n;
	for (const vault of vaults) {
		console.log(`\n${vault.ticker} — ${vault.address}`);

		let ledger: VenueFunding[];
		try {
			ledger = await venueLedger(vault.agentSolanaAddress);
		} catch (error) {
			console.log(`  ! could not read the venue's funding history: ${error}`);
			continue;
		}
		if (ledger.length === 0) {
			console.log("  the venue has no funding history for this account; nothing to backfill.");
			continue;
		}

		let published: Map<number, bigint>;
		try {
			published = await publishedByPeriod(vault.address, vault.chainId);
		} catch (error) {
			console.log(`  ! could not read what is already published: ${error}`);
			continue;
		}

		const venue = venueByPeriod(ledger);
		const venueTotal = [...venue.values()].reduce((sum, v) => sum + v, 0n);
		const publishedTotal = [...published.values()].reduce((sum, v) => sum + v, 0n);
		const missing = missingPeriods(venue, published);
		const gap = missing.reduce((sum, m) => sum + m.amount, 0n);
		gapTotal += gap;

		console.log(
			`  venue paid ${fmtUsdc(venueTotal)} over ${venue.size} period(s); the feed has ${fmtUsdc(publishedTotal)} over ${published.size}.`,
		);

		if (missing.length === 0) {
			console.log("  nothing missing.");
			continue;
		}

		console.log(
			`  ${missing.length} period(s) unpublished, worth ${fmtUsdc(gap)} — ${iso(missing[0].period)} to ${iso(missing[missing.length - 1].period)}`,
		);
		for (const m of missing.slice(0, 5)) console.log(`    ${iso(m.period)}  ${fmtUsdc(m.amount)}`);
		if (missing.length > 5) console.log(`    … and ${missing.length - 5} more`);

		if (!commit) continue;

		const rows = missing.map((m) => backfillRow(vault.ticker, m.period, m.amount));
		await publish(vault, rows, venueTotal);
	}

	console.log(
		commit
			? "\nDone."
			: `\nTotal unpublished funding: ${fmtUsdc(gapTotal)}. Re-run with --commit to publish it.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
