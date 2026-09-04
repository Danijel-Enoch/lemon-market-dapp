import staticPlugin from "@elysiajs/static";
import { createApiApp } from "@lemon/api";
import { Elysia } from "elysia";
import { reactRouter } from "elysia-react-router";

/**
 * The admin console's server.
 *
 * Mounts the same API plugin the public app does, so there is one implementation
 * of every endpoint and one place authorisation is decided. What differs is
 * exposure: this process is meant to sit behind whatever an operator already
 * uses to restrict access — a VPN, an IP allowlist, an SSO proxy — while the
 * public app faces the internet.
 *
 * That separation is the point of splitting the apps. Sharing a process meant
 * the operator console and the depositor-facing site had the same attack
 * surface and the same uptime; now the console can go down, or be locked down,
 * without touching anyone's ability to deposit or withdraw.
 */
const app = new Elysia().onRequest(({ set }) => {
	set.headers["X-Frame-Options"] = "DENY";
	set.headers["X-Content-Type-Options"] = "nosniff";
	set.headers["Referrer-Policy"] = "no-referrer";
	// Belt and braces alongside the meta tag: an operator console must not be
	// crawled even if a route forgets its own meta.
	set.headers["X-Robots-Tag"] = "noindex, nofollow";
	set.headers["Cache-Control"] = "no-store";
});

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
			headers: { "Cache-Control": "no-store" },
		}),
	);
}

app.use(await reactRouter({ getLoadContext: (ctx) => ctx, production: { assets: false } }));

const port = Number(process.env.ADMIN_PORT ?? 3004);
app.listen(port);

console.log(`Lemon Admin running on :${port}`);
