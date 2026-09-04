import { UpstreamError } from "@lemon/core";
import { PacificaError } from "@lemon/pacifica";
import { Elysia } from "elysia";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { marketRoutes } from "./routes/markets";
import { vaultRoutes } from "./routes/vaults";
import { AdminError, seedAdmins } from "./services/admin";
import { AuthError, AuthUnavailableError } from "./services/auth";

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
	seedAdmins().catch((error) => console.warn("[api] could not seed admins", error));

	return new Elysia({ prefix, name: "lemon-api" })
		.onError(({ error, code, set }) => {
			// A deployment that has not configured accounts is a 503 with an
			// explanation, not a 500: the caller did nothing wrong and there is
			// something specific an operator can do about it.
			if (error instanceof AuthUnavailableError) {
				set.status = 503;
				return { error: error.reason };
			}

			if (error instanceof AuthError) {
				set.status = error.status;
				return { error: error.message };
			}

			if (error instanceof AdminError) {
				set.status = error.status;
				return { error: error.message };
			}

			// Pacifica answers a rejected order with a 200 and success:false, so
			// its client raises rather than returning — but the failure is still
			// upstream's, and a 500 would send the caller looking in the wrong
			// place. The message is Pacifica's own and is usually actionable.
			if (error instanceof PacificaError) {
				set.status = error.status >= 400 && error.status < 500 ? error.status : 502;
				return { error: error.message, service: "pacifica", upstreamStatus: error.status };
			}

			if (error instanceof UpstreamError) {
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
				console.error("[api] database", error);
				set.status = 503;
				return {
					error:
						"The database is unavailable or out of date. If this deployment was just updated, its schema may need `bun run db:push`.",
				};
			}

			if (code === "VALIDATION") {
				set.status = 422;
				return { error: "Invalid request", details: String(error) };
			}
			if (code === "NOT_FOUND") {
				set.status = 404;
				return { error: "Not found" };
			}

			set.status = 500;
			console.error("[api]", error);
			return { error: error instanceof Error ? error.message : "Internal error" };
		})
		.get("/health", () => ({ ok: true, service: "lemon-api" }))
		.use(authRoutes)
		.use(marketRoutes)
		.use(vaultRoutes)
		.use(adminRoutes);
}

export type ApiApp = ReturnType<typeof createApiApp>;
