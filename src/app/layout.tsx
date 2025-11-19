import type { Metadata } from "next";
import { Inter, Raleway, Roboto_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { BProgressProvider } from "@/components/providers/BProgressProvider";
import { MiniAppProvider } from "@/components/providers/MiniAppProvider";
import { PageTransition } from "@/components/providers/PageTransition";
import { ReferralHandler } from "@/components/providers/ReferralHandler";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { AppProvider } from "@/contexts/AppContext";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	display: "swap",
	preload: true,
});

const robotoMono = Roboto_Mono({
	variable: "--font-roboto-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	display: "swap",
	preload: true,
});

const raleway = Raleway({
	variable: "--font-raleway",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800", "900"],
	display: "swap",
	preload: true,
});

const miniAppEmbed = {
	version: "1",
	imageUrl: "https://demo.lemonmarkets.xyz/image/features-image.png",
	button: {
		title: "Start Trading",
		action: {
			type: "launch_miniapp",
			name: "Lemon Markets",
			url: "https://demo.lemonmarkets.xyz",
			splashImageUrl: "https://demo.lemonmarkets.xyz/image/logo.png",
			splashBackgroundColor: "#000000",
		},
	},
};

export const metadata: Metadata = {
	title: "Lemon Markets - Unlimited Markets, Unlimited Opportunities",
	description:
		"Trade any asset class with up to 100x leverage on the most efficient decentralized perpetual protocol. Powering over $50M in daily trading volume.",
	keywords: [
		"decentralized trading",
		"perpetual futures",
		"crypto trading",
		"leverage trading",
		"DeFi",
	],
	other: {
		"fc:miniapp": JSON.stringify(miniAppEmbed),
		"fc:frame": JSON.stringify(miniAppEmbed),
	},
	openGraph: {
		title: "Lemon Markets - Decentralized Perpetual Trading",
		description: "Trade perpetual futures with leverage on a decentralized platform",
		images: ["https://demo.lemonmarkets.xyz/image/features-image.png"],
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Lemon Markets - Unlimited Markets, Unlimited Opportunities",
		description:
			"Trade any asset class with up to 100x leverage on the most efficient decentralized perpetual protocol.",
		images: ["https://demo.lemonmarkets.xyz/image/features-image.png"],
	},
	metadataBase: new URL("https://demo.lemonmarkets.xyz"),
	viewport: {
		width: "device-width",
		initialScale: 1,
		maximumScale: 5,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://auth.farcaster.xyz" />
				<link rel="preconnect" href="https://dd.dexscreener.com" />
				<link rel="preconnect" href="https://assets.coingecko.com" />
				<link rel="preconnect" href="https://coin-images.coingecko.com" />
				<link rel="preconnect" href="https://cdn.dexscreener.com" />
				<link rel="dns-prefetch" href="https://auth.farcaster.xyz" />
				<link rel="dns-prefetch" href="https://dd.dexscreener.com" />
				<link rel="dns-prefetch" href="https://assets.coingecko.com" />
			</head>
			<body
				className={`${inter.variable} ${robotoMono.variable} ${raleway.className} antialiased bg-black text-foreground overflow-x-hidden`}
			>
				<MiniAppProvider>
					<ToastProvider>
						<AppProvider>
							<ReferralHandler />
							<BProgressProvider />
							<Header />
							<PageTransition>{children}</PageTransition>
						</AppProvider>
					</ToastProvider>
				</MiniAppProvider>
			</body>
		</html>
	);
}
