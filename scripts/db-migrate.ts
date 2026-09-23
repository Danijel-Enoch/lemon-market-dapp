#!/usr/bin/env bun
/**
 * The schema changes `prisma db push` will not make unattended.
 *
 * Run by the `migrate` service before push. Push refuses a primary-key swap
 * without `--accept-data-loss`, so a deployment onto a database that predates
 * multi-chain fails at that step and stays failed:
 *
 *   ⚠️  There might be data loss when applying the changes:
 *   • The primary key for the `VaultConfig` table will be changed.
 *   Error: Use the --accept-data-loss flag ...
 *
 * Blocking the release there is right. The wrong fix is `--accept-data-loss`,
 * which does not answer that question once — it hands it to push permanently,
 * on a database holding custody records, for every schema change after this
 * one. This applies a specific reviewed migration instead, and only the one it
 * was written for; push still runs afterwards and still refuses anything else
 * it considers destructive.
 *
 * Applied through Prisma rather than `psql`, because the release image is a bun
 * image and has no postgres client in it. `multichain.sql` is plain DDL with no
 * dollar-quoted blocks, so splitting it on semicolons is safe — asserted below
 * rather than assumed.
 *
 * Idempotent, and specific about the middle state: a schema where only some of
 * the tables carry `chainId` is one no run of this produces, so it stops rather
 * than guessing which half is missing.
 */

import { prisma } from "@lemon/db";

/** Every table `multichain.sql` adds the column to. */
const EXPECTED_CHAIN_ID_COLUMNS = 5;

const SQL_PATH = new URL("../packages/db/prisma/multichain.sql", import.meta.url);

function log(message: string): void {
	console.log(`[db-migrate] ${message}`);
}

async function chainIdColumns(): Promise<number> {
	const rows = await prisma.$queryRaw<{ count: bigint }[]>`
		select count(*)::bigint as count
		from information_schema.columns
		where table_schema = 'public' and column_name = 'chainId'
	`;
	return Number(rows[0]?.count ?? 0);
}

/**
 * The file's statements, with its own transaction stripped.
 *
 * `BEGIN`/`COMMIT` are removed because the transaction comes from
 * `prisma.$transaction` here — nesting them would either be rejected or, worse,
 * commit half the file and leave the rest to roll back into a schema with no
 * primary key on `VaultConfig`.
 */
function statements(sql: string): string[] {
	if (sql.includes("$$")) {
		throw new Error(
			"multichain.sql now contains a dollar-quoted block, which cannot be split on semicolons. Apply it with scripts/apply-multichain.sh instead.",
		);
	}

	return sql
		.split("\n")
		.filter((line) => !line.trim().startsWith("--"))
		.join("\n")
		.split(";")
		.map((statement) => statement.trim())
		.filter(Boolean)
		.filter((statement) => !/^(BEGIN|COMMIT)$/i.test(statement));
}

async function main(): Promise<void> {
	const before = await chainIdColumns();

	if (before >= EXPECTED_CHAIN_ID_COLUMNS) {
		log("multi-chain schema already applied; nothing to do.");
		return;
	}

	if (before !== 0) {
		throw new Error(
			`${before} of ${EXPECTED_CHAIN_ID_COLUMNS} chainId columns exist, which is a half-migrated schema. ` +
				"No run of this produces that state, so it is not safe to continue. Inspect it by hand.",
		);
	}

	const sql = await Bun.file(SQL_PATH).text();
	const parts = statements(sql);
	log(`pre-multichain schema found; applying ${parts.length} statements in one transaction.`);

	// One transaction: the primary-key swap and the indexes and foreign keys
	// rebuilt around it either all land or none do. A partial apply leaves the
	// table that says which agent wallet custodies which vault without a primary
	// key, which is not a state to serve traffic from.
	await prisma.$transaction(
		parts.map((statement) => prisma.$executeRawUnsafe(statement)),
		// Generous: this rewrites indexes on the busiest tables, and a deploy that
		// timed out halfway would roll back and fail the release for a reason that
		// looks like a bug rather than a budget.
		{ timeout: 120_000 },
	);

	const after = await chainIdColumns();
	if (after < EXPECTED_CHAIN_ID_COLUMNS) {
		throw new Error(
			`applied, but only ${after} of ${EXPECTED_CHAIN_ID_COLUMNS} chainId columns are present.`,
		);
	}

	const onBase = await prisma.vaultConfig.count({ where: { chainId: 8453 } });
	const total = await prisma.vaultConfig.count();
	log(`applied. ${after} chainId columns; ${onBase} of ${total} vault rows on Base, as they were.`);
}

main()
	.then(() => prisma.$disconnect())
	.catch(async (error) => {
		console.error("[db-migrate] failed:", error instanceof Error ? error.message : error);
		await prisma.$disconnect().catch(() => {});
		// Non-zero so the `migrate` service fails and the release is blocked, which
		// is the same contract push has.
		process.exit(1);
	});
