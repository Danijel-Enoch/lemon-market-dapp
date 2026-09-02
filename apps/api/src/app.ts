import { UpstreamError } from "@lemon/core";
import { Elysia } from "elysia";
import { basketRoutes } from "./routes/baskets";
import { carryRoutes } from "./routes/carry";
import { depositRoutes } from "./routes/deposit";
import { marketRoutes } from "./routes/markets";
import { perpRoutes } from "./routes/perp";
import { pointsRoutes } from "./routes/points";
import { spotRoutes } from "./routes/spot";
import { CarryTransitionError } from "./services/carry";

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
			if (error instanceof CarryTransitionError) {
				set.status = 409;
				return { error: error.message };
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
		.use(marketRoutes)
		.use(perpRoutes)
		.use(spotRoutes)
		.use(basketRoutes)
		.use(carryRoutes)
		.use(pointsRoutes)
		.use(depositRoutes);
}

export type ApiApp = ReturnType<typeof createApiApp>;
