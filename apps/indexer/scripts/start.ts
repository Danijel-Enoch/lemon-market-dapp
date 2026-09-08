/**
 * Start Ponder, and recover the one failure that otherwise wedges a deploy.
 *
 * Ponder stamps the `ponder` schema with a build id hashed from `ponder.config.ts`,
 * `ponder.schema.ts` and the indexing functions. On start it compares that stamp
 * against the running build, and a mismatch is fatal:
 *
 *   MigrationError: Schema "ponder" was previously used by a different Ponder app.
 *
 * Which is to say: every deploy that changes how the read model is *derived*
 * kills the indexer, and `restart: unless-stopped` then reruns the same failure
 * every thirty seconds until someone opens a psql on the host. The app does not
 * fail loudly when that happens — the API answers `200 []`, the board renders
 * empty, and nothing but `/api/health` says why (see `indexer-health.ts`).
 *
 * Refusing is the right default for Ponder, whose schema is often the product.
 * Here it is not: the read model is derived state, reproducible from chain
 * events, and no consumer reads it as SQL — the API, the admin console and the
 * agent all reach it over HTTP on `INDEXER_URL`. So the schema name is private
 * to this container and its contents are disposable, which makes "drop it and
 * reindex" the correct answer to a build-id mismatch rather than a data loss.
 *
 * Deliberately narrow. It drops only on the message Ponder emits for a schema
 * owned by a different build, and only once — a crash loop from a bad RPC or a
 * failing handler still exits non-zero and stays exited, and an ordinary restart
 * still gets Ponder's crash recovery, which resumes from the last checkpoint
 * instead of reindexing.
 *
 * It also drops nothing but the `ponder` schema. Ponder caches the raw chain
 * data it has already fetched in a separate `ponder_sync` schema, and that is
 * the expensive half — the logs and blocks have not changed, only what we
 * compute from them, so a reindex replays from cache rather than from the RPC
 * and finishes in a fraction of the original backfill.
 *
 * Usage: bun run apps/indexer/scripts/start.ts   (see the `start` script)
 */

import { SQL } from "bun";

/**
 * Ponder's own wording, trimmed to the part both variants share — a schema
 * belonging to a different build, and one belonging to a different minor
 * version of Ponder. Both mean the same thing here and take the same remedy.
 */
const STALE_SCHEMA = "was previously used by a";

/** Must match the schema Ponder is started with, below. */
const SCHEMA = process.env.PONDER_SCHEMA ?? "ponder";

const ponder = ["bunx", "ponder", "start", "--schema", SCHEMA];

interface Attempt {
	code: number;
	/** Whether Ponder rejected the schema as another build's. */
	staleSchema: boolean;
}

/**
 * Run Ponder to completion, passing its output through untouched.
 *
 * Piped rather than inherited so the exit reason can be read, which is the only
 * place Ponder reports it — the message goes to the log and the process exits 1,
 * with nothing in the database or the exit code to distinguish this failure from
 * any other.
 */
async function start(): Promise<Attempt> {
	const child = Bun.spawn(ponder, { stdout: "pipe", stderr: "pipe" });

	// SIGTERM is how Compose stops a container. Without this the wrapper dies and
	// Ponder is left holding the schema lock until its heartbeat expires, which
	// delays the next start by minutes for no reason.
	const forward = (signal: NodeJS.Signals) => child.kill(signal);
	process.on("SIGTERM", forward);
	process.on("SIGINT", forward);

	let staleSchema = false;
	const tee = async (from: ReadableStream<Uint8Array>, to: Bun.BunFile) => {
		const reader = from.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (decoder.decode(value, { stream: true }).includes(STALE_SCHEMA)) staleSchema = true;
			await Bun.write(to, value);
		}
	};

	try {
		await Promise.all([tee(child.stdout, Bun.stdout), tee(child.stderr, Bun.stderr)]);
		return { code: await child.exited, staleSchema };
	} finally {
		process.off("SIGTERM", forward);
		process.off("SIGINT", forward);
	}
}

/**
 * Drop the read model.
 *
 * Scoped to Ponder's own schema, so it cannot reach Prisma's tables in `public`
 * — the same guarantee `scripts/indexer-reset.sh` relies on, and the reason the
 * indexer was given a schema of its own in the first place.
 */
async function dropSchema(url: string) {
	const sql = new SQL(url);
	try {
		await sql.unsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
	} finally {
		await sql.end();
	}
}

let attempt = await start();

if (attempt.code !== 0 && attempt.staleSchema) {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error(
			`indexer: schema "${SCHEMA}" belongs to a different build and DATABASE_URL is unset, so it cannot be dropped. Run \`bun run indexer:reset\`.`,
		);
		process.exit(attempt.code);
	}
	console.warn(
		`indexer: schema "${SCHEMA}" belongs to a different build of this app. Dropping it and reindexing from VAULT_FACTORY_START_BLOCK — the read model is derived, so nothing is lost but the time to replay it.`,
	);
	await dropSchema(url);
	attempt = await start();
}

process.exit(attempt.code);
