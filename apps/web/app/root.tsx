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
			// Pons sets everything in Space Grotesk — display, UI and data alike —
			// and leans on tabular figures rather than switching to a mono face.
			rel: "stylesheet",
			href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
		},
		{
			// Kept for the few places that want true fixed-width glyphs: stack
			// traces and raw payloads.
			rel: "stylesheet",
			href: "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap",
		},
		{ rel: "icon", href: "/favicon.ico" },
	];
};

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
		<html lang="en" className="dark">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{is404 ? "404 - Lemon Markets" : "Error - Lemon Markets"}</title>
				<Meta />
				<Links />
			</head>
			<body className="bg-[var(--pon-bg)] font-sans text-[var(--pon-fg)] antialiased">
				<div className="relative flex min-h-screen items-center justify-center overflow-hidden p-5">
					{/* The same aurora the landing hero runs, at half strength. */}
					<div
						aria-hidden
						className="aurora left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2"
						style={{ ["--aurora" as string]: "rgba(163,230,53,0.16)" }}
					/>

					{/* The Pons hero panel, reused: gradient body, hairline frame,
					    accent bloom in the corner. */}
					<div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--pon-r-2xl)] border border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-bg-2)] to-[var(--pon-bg)] p-8">
						<div aria-hidden className="pon-bloom-lg" />

						<div className="relative flex flex-col items-center space-y-6 text-center">
							<span className="flex size-16 items-center justify-center rounded-[18px] bg-[var(--pon-lime)] text-3xl">
								🍋
							</span>

							<div className="space-y-2.5">
								<p className="t-eyebrow text-[var(--pon-lime)]">
									{is404 ? "Error 404" : "Something broke"}
								</p>
								<h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-[var(--pon-fg-0)]">
									{is404 ? "Lost in the juice?" : "Squeeze hazard"}
								</h1>
								<p className="text-[15px] leading-relaxed text-[var(--pon-fg-2)]">{message}</p>
							</div>

							{stack && import.meta.env.DEV && (
								<div className="max-h-64 w-full overflow-x-auto rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-4 text-left">
									<pre className="font-mono text-[11px] leading-relaxed text-[var(--pon-down)]">
										{stack}
									</pre>
								</div>
							)}

							<a
								href="/"
								className="inline-flex items-center justify-center rounded-full bg-[var(--pon-lime)] px-7 py-3.5 text-[15px] font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
							>
								Back to markets
							</a>
						</div>
					</div>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
