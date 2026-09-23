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

export const meta: Route.MetaFunction = () => {
	return [
		{ title: "Lemon Markets" },
		{
			name: "description",
			content:
				"Earn from stocks and crypto on Base without betting on the price. Deposit USDC into a vault that owns the asset and hedges it one-for-one, and collect what the market pays to hold it.",
		},
		{
			property: "og:title",
			content: "Lemon Markets",
		},
		{
			property: "og:description",
			content:
				"Stocks and crypto on Base, fully hedged. Earn what the market pays, not the price move.",
		},
		{
			property: "og:image",
			content: "https://lemonmarkets.xyz/image/features-image.png",
		},
	];
};

export const links: Route.LinksFunction = () => {
	return [
		{ rel: "dns-prefetch", href: "https://fonts.googleapis.com" },
		{ rel: "dns-prefetch", href: "https://fonts.gstatic.com" },
		{ rel: "preconnect", href: "https://fonts.googleapis.com" },
		{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
		{
			// Two faces, split by job. Newsreader is the editorial serif that
			// carries every headline and every piece of prose; Space Mono is the
			// utility face that carries every label, figure, address and control.
			// One request, because a second stylesheet is a second round trip
			// before the page can paint its own type.
			rel: "stylesheet",
			href: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700;6..72,800&family=Space+Mono:wght@400;700&display=swap",
		},
		{ rel: "icon", href: "/favicon.ico" },
	];
};

export default function App() {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#a3e635" />
				<Meta />
				<Links />
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
	let message = "An unexpected error occurred";
	let stack = (error as Error)?.stack;
	const is404 = isRouteErrorResponse(error) && error.status === 404;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "This page doesn't exist." : error.statusText;
		stack = undefined;
	} else if (error instanceof Error) {
		message = error.message;
	}

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{is404 ? "404 - Lemon Markets" : "Error - Lemon Markets"}</title>
				<Meta />
				<Links />
			</head>
			<body className="bg-[var(--pon-bg)] font-mono text-[var(--pon-fg)] antialiased">
				{/* The page's vertical rules run behind the error too — it is the same
				    sheet, with nothing printed on it. */}
				<div aria-hidden className="firm-rules" />

				<div className="relative flex min-h-screen items-center justify-center p-5">
					<div className="w-full max-w-xl">
						<p className="firm-label text-[var(--pon-fg-2)]">
							{is404 ? "Error 404 · Not found" : "Error · Unhandled"}
						</p>

						<h1 className="t-display mt-4 text-[var(--pon-fg-0)]">
							{is404 ? "Lost in the juice?" : "Squeeze hazard"}
						</h1>

						<div className="mt-6 border-t border-[var(--pon-line)] pt-5">
							<p className="t-body max-w-[52ch] text-[var(--pon-fg-2)]">{message}</p>
						</div>

						{stack && import.meta.env.DEV && (
							<div className="mt-5 max-h-64 overflow-x-auto border border-[var(--pon-down)] p-3.5">
								<pre className="font-mono text-[11px] leading-relaxed text-[var(--pon-down)]">
									{stack}
								</pre>
							</div>
						)}

						<a
							href="/"
							className="mt-7 inline-flex items-center justify-center rounded-[var(--pon-r-lg)] border border-[var(--pon-ink)] bg-[var(--pon-ink)] px-5 py-3 font-mono text-[13px] tracking-[-0.02em] text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
						>
							Back to markets
						</a>
					</div>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
