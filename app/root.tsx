import { PostHogProvider } from "posthog-js/react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { MiniAppProvider } from "./components/providers/MiniAppProvider";
import { ToastProvider } from "./components/providers/ToastProvider";
import { AppProvider } from "./contexts/AppContext";
import "./globals.css";

const posthogOptions = {
	api_host: "https://us.i.posthog.com",
	defaults: "2025-11-30",
} as const;

export const meta: Route.MetaFunction = () => {
	return [
		{ title: "Lemon Markets" },
		{
			name: "description",
			content: "Lemon Markets - DeFi Trading Platform",
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
				<Meta />
				<Links />
			</head>
			<body className="antialiased bg-black text-white">
				<PostHogProvider
					apiKey={"phc_3yzfWThidiuKV0AbmI2r7WOrtSx0PEAcGdDbQujHyl5"}
					options={posthogOptions}
				>
					<MiniAppProvider>
						<ToastProvider>
							<AppProvider>
								<Outlet />
							</AppProvider>
						</ToastProvider>
					</MiniAppProvider>
				</PostHogProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export function ErrorBoundary({ error }: { error: Error }) {
	return (
		<html lang="en" className="dark">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Error | Lemon Markets</title>
			</head>
			<body className="antialiased">
				<div className="min-h-screen flex items-center justify-center bg-background">
					<div className="text-center">
						<h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
						<p className="text-muted-foreground">
							{error?.message || "An unexpected error occurred"}
						</p>
					</div>
				</div>
			</body>
		</html>
	);
}
