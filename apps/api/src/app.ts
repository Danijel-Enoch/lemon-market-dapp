import { UpstreamError } from "@lemon/core";
import { PacificaError } from "@lemon/pacifica";
import { Elysia } from "elysia";
import { authRoutes } from "./routes/auth";
import { basketRoutes } from "./routes/baskets";
import { carryRoutes } from "./routes/carry";
import { depositRoutes } from "./routes/deposit";
import { marketRoutes } from "./routes/markets";
import { pacificaRoutes } from "./routes/pacifica";
import { pointsRoutes } from "./routes/points";
import { spotRoutes } from "./routes/spot";
import { AuthError, AuthUnavailableError } from "./services/auth";
import { CarryLegError, CarryTransitionError } from "./services/carry";
import { DepositUnavailableError } from "./services/pacifica-deposit";

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
	return new Elysia({ prefix, name: "lemon-api" })
		.onError(({ error, code, set }) => {
			// A deployment that has not configured accounts is a 503 with an
			// explanation, not a 500: the caller did nothing wrong and there is
			// something specific an operator can do about it.
			if (error instanceof AuthUnavailableError || error instanceof DepositUnavailableError) {
				set.status = 503;
				return { error: error.reason };
			}

			if (error instanceof AuthError) {
				set.status = error.status;
				return { error: error.message };
			}

			if (error instanceof CarryTransitionError) {
				set.status = 409;
				return { error: error.message };
			}

			// A leg the venue refused. 422 rather than 409: the request was
			// legal, the execution was not possible.
			if (error instanceof CarryLegError) {
				set.status = 422;
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
		.use(pacificaRoutes)
		.use(spotRoutes)
		.use(basketRoutes)
		.use(carryRoutes)
		.use(pointsRoutes)
		.use(depositRoutes);
}

export type ApiApp = ReturnType<typeof createApiApp>;
