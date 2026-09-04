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
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap",
	},
	{ rel: "icon", href: "/favicon.ico" },
];

export default function App() {
	return (
		<html lang="en" className="dark">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#000000" />
				<Meta />
				<Links />
			</head>
			<body className="bg-[var(--pon-bg)] font-sans text-[var(--pon-fg)] antialiased">
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
