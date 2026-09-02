import staticPlugin from "@elysiajs/static";
import { createApiApp } from "@lemon/api";
import { Elysia } from "elysia";
import { reactRouter } from "elysia-react-router";

const app = new Elysia().onRequest(({ set, request }) => {
	set.headers["X-Frame-Options"] = "SAMEORIGIN";
	set.headers["X-Content-Type-Options"] = "nosniff";
	set.headers["Referrer-Policy"] = "no-referrer-when-downgrade";

	const url = new URL(request.url);

	// Only content-hashed build output may be cached immutably. Matching on the
	// file extension instead would also catch Vite's dev-server URLs, which keep
	// a stable path while their contents change — the browser then pins a
	// stylesheet for a year and silently serves deleted CSS after every edit.
	const isHashedAsset = url.pathname.startsWith("/assets/");
	const isStaticFile = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$/.test(url.pathname);

	if (isHashedAsset && process.env.NODE_ENV === "production") {
		set.headers["Cache-Control"] = "public, max-age=31536000, immutable";
	} else if (isStaticFile && process.env.NODE_ENV === "production") {
		// Unhashed statics (favicon, images in /public) — revalidate rather than pin.
		set.headers["Cache-Control"] = "public, max-age=3600, must-revalidate";
	} else {
		set.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
	}
});

/**
 * The API is mounted in-process rather than proxied.
 *
 * One container serves both the app and its API, which keeps deployment and
 * local dev to a single command — while `apps/api` still has its own entrypoint
 * for running standalone, so splitting it out later needs no code change.
 *
 * Mounted before the React Router catch-all, which would otherwise swallow
 * /api/* and answer with the SPA shell.
 */
app.use(createApiApp());

if (process.env.NODE_ENV === "production") {
	app.use(
		await staticPlugin({
			assets: "./build/client/assets",
			prefix: "/assets",
			alwaysStatic: true,
			headers: { "Cache-Control": "public, max-age=31536000, immutable" },
		}),
	);
	app.use(
		await staticPlugin({
			assets: "./build/client",
			prefix: "/",
			alwaysStatic: true,
			headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
		}),
	);
}

app.use(
	await reactRouter({
		getLoadContext: (ctx) => ctx,
		production: { assets: false },
	}),
);

const port = Number(process.env.PORT ?? 3002);
app.listen(port);

console.log(`Lemon Markets running on :${port}`);
