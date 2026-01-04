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
			content: "Lemon Markets - DeFi Trading Platform",
		},
		{
			property: "og:title",
			content: "Lemon Markets",
		},
		{
			property: "og:description",
			content: "Lemon Markets - DeFi Trading Platform",
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
			rel: "stylesheet",
			href: "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap",
		},
		{
			rel: "stylesheet",
			href: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap",
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
			<body className="antialiased bg-black text-white">
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
			<body className="antialiased bg-[#0f1419] text-[#e8eaed] font-sans selection:bg-[#a3e635] selection:text-black">
				<div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
					{/* Background Gradients */}
					<div className="absolute top-0 left-1/4 w-96 h-96 bg-[#a3e635]/10 rounded-full blur-[100px] pointer-events-none" />
					<div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#2d3748]/20 rounded-full blur-[100px] pointer-events-none" />

					<div className="max-w-lg w-full bg-[#0a0a0a] border border-[#333333] rounded-2xl p-8 shadow-2xl relative z-10">
						<div className="flex flex-col items-center text-center space-y-6">
							{/* Icon */}
							<div className="w-20 h-20 rounded-full bg-[#a3e635]/10 flex items-center justify-center ring-1 ring-[#a3e635]/50 shadow-[0_0_20px_rgba(163,230,53,0.2)]">
								<span className="text-4xl">🍋</span>
							</div>

							<div className="space-y-2">
								<h1 className="text-3xl font-bold text-white tracking-tight">
									{is404 ? "Lost in the Juice?" : "Squeeze Hazard"}
								</h1>
								<p className="text-[#94a3b8] text-base leading-relaxed">{message}</p>
							</div>

							{stack && import.meta.env.DEV && (
								<div className="w-full text-left bg-[#050505] border border-[#222222] rounded-lg p-4 overflow-x-auto max-h-64 scrollbar-thin">
									<pre className="text-xs text-red-400 font-mono leading-tight">{stack}</pre>
								</div>
							)}

							<div className="pt-2">
								<a
									href="/"
									className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-[#a3e635] text-black font-bold text-sm tracking-wide hover:bg-[#84cc16] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#a3e635]/20"
								>
									BACK TO MARKET
								</a>
							</div>
						</div>
					</div>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
