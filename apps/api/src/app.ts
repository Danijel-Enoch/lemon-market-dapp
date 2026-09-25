import { formatDuration, UpstreamError } from "@lemon/core";
import { PacificaError } from "@lemon/pacifica";
import { Elysia } from "elysia";
import { logger } from "./log";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { marketRoutes } from "./routes/markets";
import { NotSignedInError, selfRoutes } from "./routes/self";
import { vaultRoutes } from "./routes/vaults";
import { AdminError, seedAdmins } from "./services/admin";
import { AuthError, AuthUnavailableError } from "./services/auth";
import { BridgeUnavailableError } from "./services/self-bridge";
import { ExecutionError } from "./services/self-execution";
import { PerpUnavailableError } from "./services/self-perp";
import { WalletUnavailableError } from "./services/user-wallet";

/**
 * Anything thrown by Prisma.
 *
 * Matched on the constructor-name prefix rather than by importing Prisma's
 * error classes: the generated client re-exports them from a path that changes
 * between versions, and an import that silently resolves to `undefined` would
 * turn this guard into a no-op that always returns false — failing open, and
 * leaking exactly what it was written to hide.
 */
function isPrismaError(error: unknown): boolean {
	return error instanceof Error && error.constructor.name.startsWith("PrismaClient");
}

/**
 * Re-exported so `index.ts` and the routes can log under the same scope without
 * knowing where it is defined. One logger for the process: the API is mounted
 * inside `apps/web` as well as run standalone, and a shared scope is what keeps
 * its lines identifiable in the web app's output.
 */
export { logger as apiLogger };

/**
 * Paths that answer constantly and say nothing when they succeed.
 *
 * Logged at debug rather than info, because a health check every few seconds
 * fills the window an operator is trying to read the interesting requests in.
 * A failing one is still logged at warn or error by the status check, which is
 * the only time it is worth seeing.
 */
const QUIET_SUFFIXES = ["/health"];

function isQuiet(pathname: string): boolean {
	return QUIET_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
}

/**
 * The API surface, mountable two ways.
 *
 * `apps/web` mounts this plugin directly so a single container serves both the
 * app and its API, while `src/index.ts` runs it standalone. Same code either
 * way, so splitting the API onto its own host later needs no rewrite.
 *
 * Everything that needs a secret lives behind here: the Relay API key and the
 * KyberSwap client id never reach the browser bundle.
 */
export function createApiApp(prefix = "/api") {
	// Seed the admin table from the environment, once, without blocking startup.
	// A deployment with no admins is one where no vault can ever be created, so
	// this has to happen somewhere — but it must not stop the app serving market
	// data if the database is briefly unreachable.
	seedAdmins().catch((error) => logger.warn("Could not seed admins", error));

	return (
		new Elysia({ prefix, name: "lemon-api" })
			// One line in and one line out per request. The pair is what makes a hung
			// upstream visible: a request with a `→` and no matching line is still
			// inside a handler, which no single completion log can tell you.
			.derive(({ request }) => {
				const pathname = new URL(request.url).pathname;
				logger.debug(`→ ${request.method} ${pathname}`);
				return { startedAt: performance.now(), pathname };
			})
			.onAfterResponse(({ request, set, startedAt, pathname }) => {
				// Numeric because that is what every handler here sets; Elysia also
				// allows the string form, which has no number to log and is treated as
				// the 200 it almost always is.
				const status = typeof set.status === "number" ? set.status : 200;
				const line = `${request.method} ${pathname} ${status} in ${formatDuration(performance.now() - startedAt)}`;

				if (status >= 500) logger.error(line);
				else if (status >= 400) logger.warn(line);
				else if (isQuiet(pathname)) logger.debug(line);
				else logger.info(line);
			})
			.onError(({ error, code, set, request }) => {
				// Named once, because every branch below logs it: an error line without
				// the route it came from sends the reader back to the access log to pair
				// them up by timestamp.
				const where = `${request.method} ${new URL(request.url).pathname}`;

				// A deployment that has not configured accounts is a 503 with an
				// explanation, not a 500: the caller did nothing wrong and there is
				// something specific an operator can do about it.
				if (error instanceof AuthUnavailableError) {
					logger.warn(`${where}: sign-in is unconfigured — ${error.reason}`);
					set.status = 503;
					return { error: error.reason };
				}

				if (error instanceof AuthError) {
					logger.debug(`${where}: rejected ${error.status} — ${error.message}`);
					set.status = error.status;
					return { error: error.message };
				}

				if (error instanceof AdminError) {
					logger.warn(`${where}: refused ${error.status} — ${error.message}`);
					set.status = error.status;
					return { error: error.message };
				}

				// A signed-out caller on a route that names someone's own funds. Not
				// logged above debug: it is the ordinary first request of every
				// anonymous visit, not a problem anyone has to look at.
				if (error instanceof NotSignedInError) {
					logger.debug(`${where}: 401 not signed in`);
					set.status = 401;
					return { error: error.message };
				}

				// Carries its own status because the distinctions matter to the
				// browser: 409 is "something is already running on this position",
				// 502 is "your leg went through and ours did not", and those two want
				// very different things on screen.
				if (error instanceof ExecutionError) {
					logger.warn(`${where}: refused ${error.status} — ${error.message}`);
					set.status = error.status;
					return { error: error.message };
				}

				// Unconfigured rather than broken: the caller did nothing wrong and an
				// operator has something specific to do about it.
				if (
					error instanceof WalletUnavailableError ||
					error instanceof PerpUnavailableError ||
					error instanceof BridgeUnavailableError
				) {
					logger.warn(`${where}: unavailable — ${error.message}`);
					set.status = 503;
					return { error: error.message };
				}

				// Pacifica answers a rejected order with a 200 and success:false, so
				// its client raises rather than returning — but the failure is still
				// upstream's, and a 500 would send the caller looking in the wrong
				// place. The message is Pacifica's own and is usually actionable.
				if (error instanceof PacificaError) {
					logger.warn(`${where}: pacifica answered ${error.status} — ${error.message}`);
					set.status = error.status >= 400 && error.status < 500 ? error.status : 502;
					return { error: error.message, service: "pacifica", upstreamStatus: error.status };
				}

				if (error instanceof UpstreamError) {
					logger.warn(
						`${where}: ${error.service} answered ${error.status} — ${error.message}`,
						error.body,
					);
					// 502 rather than 500: the failure is upstream, and the
					// distinction matters when reading logs or deciding to retry.
					set.status = error.status === 0 ? 504 : 502;
					return {
						error: error.message,
						service: error.service,
						upstreamStatus: error.status,
						details: error.body,
					};
				}

				// Prisma stringifies its errors with the failing query, the source
				// file and a snippet of surrounding code. That is excellent in a log
				// and unacceptable in an HTTP body — a caller hitting a schema that
				// has not been migrated should not be told the server's absolute file
				// paths. The detail goes to the log; the caller gets the category.
				if (isPrismaError(error)) {
					logger.error(`${where}: the database rejected a query`, error);
					set.status = 503;
					return {
						error:
							"The database is unavailable or out of date. If this deployment was just updated, its schema may need `bun run db:push`.",
					};
				}

				if (code === "VALIDATION") {
					logger.debug(`${where}: 422 invalid request — ${String(error)}`);
					set.status = 422;
					return { error: "Invalid request", details: String(error) };
				}
				if (code === "NOT_FOUND") {
					logger.debug(`${where}: 404`);
					set.status = 404;
					return { error: "Not found" };
				}

				set.status = 500;
				logger.error(`${where}: unhandled`, error);
				return { error: error instanceof Error ? error.message : "Internal error" };
			})
			.get("/health", () => ({ ok: true, service: "lemon-api" }))
			.use(authRoutes)
			.use(marketRoutes)
			.use(selfRoutes)
			.use(vaultRoutes)
			.use(adminRoutes)
	);
}

export type ApiApp = ReturnType<typeof createApiApp>;
