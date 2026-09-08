import { Elysia } from "elysia";
import { apiLogger, createApiApp } from "./app";
import { config } from "./config";

const port = Number(process.env.API_PORT ?? 3003);

const app = new Elysia()
	.onRequest(({ set }) => {
		set.headers["X-Content-Type-Options"] = "nosniff";
		set.headers["Cache-Control"] = "no-store";
	})
	.use(createApiApp())
	.listen(port);

// One block at boot, because every line here answers a question that otherwise
// gets asked of the source: which chain, which upstreams, and which of the
// optional pieces are actually configured in *this* deployment.
apiLogger.info(`lemon-api listening on :${port}`);
apiLogger.info(`  chain            ${config.chainId}`);
apiLogger.info(`  pacifica         ${config.pacificaApiUrl}`);
apiLogger.info(`  kyberswap        ${config.kyberBaseUrl}`);
apiLogger.info(`  indexer          ${config.indexerUrl}`);
apiLogger.info(
	`  agent wallets    ${config.near.accountId ? `NEAR ${config.near.accountId}` : "NOT SET — vaults cannot be created"}`,
);
apiLogger.info(
	`  factory          ${config.contracts.vaultFactory ?? "NOT SET — vaults cannot be created"}`,
);
apiLogger.info(
	`  database         ${config.databaseUrl ? "configured" : "NOT SET — sign-in and the admin dashboard disabled"}`,
);
apiLogger.info(`  admins           ${config.bootstrapAdmins.length} seeded from ADMIN_ADDRESSES`);
apiLogger.info(
	`  logging          ${apiLogger.enabled("debug") ? "debug — every request in and out" : "info — one line per request; set LOG_LEVEL=debug for more"}`,
);

export type App = typeof app;
