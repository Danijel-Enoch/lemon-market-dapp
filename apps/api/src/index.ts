import { Elysia } from "elysia";
import { createApiApp } from "./app";
import { config } from "./config";

const port = Number(process.env.API_PORT ?? 3003);

const app = new Elysia()
	.onRequest(({ set }) => {
		set.headers["X-Content-Type-Options"] = "nosniff";
		set.headers["Cache-Control"] = "no-store";
	})
	.use(createApiApp())
	.listen(port);

console.log(`lemon-api listening on :${port}`);
console.log(`  chain            ${config.chainId}`);
console.log(`  pacifica         ${config.pacificaApiUrl}`);
console.log(`  kyberswap        ${config.kyberBaseUrl}`);
console.log(`  indexer          ${config.indexerUrl}`);
console.log(
	`  agent wallets    ${config.near.accountId ? `NEAR ${config.near.accountId}` : "NOT SET — vaults cannot be created"}`,
);
console.log(
	`  factory          ${config.contracts.vaultFactory ?? "NOT SET — vaults cannot be created"}`,
);
console.log(
	`  database         ${config.databaseUrl ? "configured" : "NOT SET — sign-in and the admin dashboard disabled"}`,
);
console.log(`  admins           ${config.bootstrapAdmins.length} seeded from ADMIN_ADDRESSES`);

export type App = typeof app;
