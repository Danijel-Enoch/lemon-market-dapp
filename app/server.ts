import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { reactRouter } from "elysia-react-router";

const app = new Elysia()
	.onRequest(({ set }) => {
		// Security headers
		set.headers["X-Frame-Options"] = "SAMEORIGIN";
		set.headers["X-XSS-Protection"] = "1; mode=block";
		set.headers["X-Content-Type-Options"] = "nosniff";
		set.headers["Referrer-Policy"] = "no-referrer-when-downgrade";
		if (process.env.NODE_ENV === "production") {
			set.headers["Content-Security-Policy"] =
				"default-src 'self' http: https: data: blob: 'unsafe-inline'; connect-src 'self' http: https: wss: https://relay.walletconnect.org wss://relay.walletconnect.org https://io.dexscreener.com wss://io.dexscreener.com https://dexscreener.com; script-src 'self' http: https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; font-src 'self' http: https: data:; frame-src https://dexscreener.com;";
		}
	})
	.get("/api/geckoterminal/*", async ({ params, request }) => {
		const path = params["*"];
		const url = new URL(request.url);
		return fetch(`https://api.geckoterminal.com/${path}${url.search}`, {
			headers: { "X-Forwarded-For": "127.0.0.1" },
		});
	})
	.get("/api/dexscreener/*", async ({ params, request }) => {
		const path = params["*"];
		const url = new URL(request.url);
		return fetch(`https://api.dexscreener.com/${path}${url.search}`, {
			headers: { "X-Forwarded-For": "127.0.0.1" },
		});
	})
	.get("/api/coingecko/*", async ({ params, request }) => {
		const path = params["*"];
		const url = new URL(request.url);
		return fetch(`https://api.coingecko.com/${path}${url.search}`, {
			headers: { "X-Forwarded-For": "127.0.0.1" },
		});
	});

// Serve static assets in production before React Router catches all routes
if (process.env.NODE_ENV === "production") {
	app.use(
		await staticPlugin({
			assets: `${process.cwd()}/build/client`,
			prefix: "/",
			alwaysStatic: true,
		}),
	);
}

app.use(
	await reactRouter({
		getLoadContext: (ctx) => ctx,
		production: {
			assets: false,
		},
	}),
);

app.listen(3002);

console.log("Server is running on port 3002");
