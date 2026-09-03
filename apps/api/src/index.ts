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
console.log(
	`  accounts         ${config.near.accountId ? `NEAR ${config.near.accountId}` : "NOT SET — sign-in disabled"}`,
);
console.log(
	`  builder code     ${config.fees.pacificaBuilder ? config.fees.pacificaBuilder.code : "none — orders unattributed"}`,
);
console.log(
	`  relay            ${config.relayApiUrl} ${config.relayApiKey ? "(key set)" : "(NO KEY — deposits disabled)"}`,
);
console.log(
	`  database         ${config.databaseUrl ? "configured" : "NOT SET — cash & carry disabled"}`,
);

export type App = typeof app;
