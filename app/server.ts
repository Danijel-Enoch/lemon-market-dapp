import { Elysia } from "elysia";
import { reactRouter } from "elysia-react-router";

new Elysia()
	.onRequest(({ set, request }) => {
		const url = new URL(request.url);

		// Security headers
		set.headers["X-Frame-Options"] = "SAMEORIGIN";
		set.headers["X-XSS-Protection"] = "1; mode=block";
		set.headers["X-Content-Type-Options"] = "nosniff";
		set.headers["Referrer-Policy"] = "no-referrer-when-downgrade";
		set.headers["Content-Security-Policy"] =
			"default-src 'self' http: https: data: blob: 'unsafe-inline'; connect-src 'self' http: https: wss: https://relay.walletconnect.org wss://relay.walletconnect.org https://io.dexscreener.com wss://io.dexscreener.com https://dexscreener.com; script-src 'self' http: https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; font-src 'self' http: https: data:; frame-src https://dexscreener.com;";
		set.headers["Permissions-Policy"] = "fullscreen=(self https://dexscreener.com)";

		// Cache Control for assets
		if (url.pathname.startsWith("/assets/")) {
			set.headers["Cache-Control"] = "public, max-age=31536000, immutable";
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
	})
	.use(await reactRouter({ getLoadContext: (ctx) => ctx }))
	.listen(3002);

console.log("Server is running on port 3002");
