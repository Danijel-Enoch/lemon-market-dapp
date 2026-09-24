import { ThemeScript } from "@lemon/ui";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./globals.css";

export const meta: Route.MetaFunction = () => [
	{ title: "Lemon Admin" },
	// Never indexed. An operator console has nothing secret in it — the API
	// gates every route on a session — but it has no business in search results.
	{ name: "robots", content: "noindex, nofollow" },
];

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
	{
		// The same pair the public app runs: the editorial serif for anything
		// with a voice, the mono for every label, figure and control.
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700;6..72,800&family=Space+Mono:wght@400;700&display=swap",
	},
	{ rel: "icon", href: "/favicon.ico" },
];

export default function App() {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				{/* Updated by the theme script and the toggle, because it is the one
				    part of the page CSS cannot reach: it colours the mobile browser's
				    own bar, and a lime bar above a dark app is exactly the mismatch a
				    theme is supposed to remove. */}
				<meta name="theme-color" content="#a3e635" />
				<Meta />
				<Links />
				{/* Last in the head and before any bundle: it sets the theme attribute
				    ahead of the first paint, which is what stops a flash of the wrong
				    palette on every navigation. */}
				<ThemeScript />
			</head>
			<body className="bg-[var(--pon-bg)] font-mono text-[var(--pon-fg)] antialiased">
				<Outlet />
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export function ErrorBoundary({ error }: { error: unknown }) {
	const is404 = isRouteErrorResponse(error) && error.status === 404;
	const message = is404 ? "No such page" : "Something went wrong";
	// The stack is shown in development only. An operator console is still a web
	// page, and a stack trace in production tells a stranger the server's paths.
	const stack = import.meta.env.DEV ? (error as Error)?.stack : undefined;

	return (
		<main className="mx-auto max-w-2xl px-6 py-24">
			<h1 className="text-2xl font-semibold text-[var(--pon-fg-0)]">{message}</h1>
			{stack && (
				<pre className="mt-6 overflow-x-auto rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4 text-xs text-[var(--pon-fg-3)]">
					{stack}
				</pre>
			)}
			<a href="/" className="mt-6 inline-block text-sm text-[var(--pon-lime)] underline">
				Back to the dashboard
			</a>
		</main>
	);
}
