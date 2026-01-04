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
			assets: "./build/client",
			prefix: "/",
			alwaysStatic: true,
			headers: {
				"Cache-Control": "public, max-age=31536000, immutable",
			},
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
