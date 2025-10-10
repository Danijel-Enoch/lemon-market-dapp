import type { Metadata } from "next";
import { Inter, Raleway, Roboto_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { BProgressProvider } from "@/components/providers/BProgressProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { MiniAppProvider } from "@/components/providers/MiniAppProvider";
import { AppProvider } from "@/contexts/AppContext";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"]
});

const robotoMono = Roboto_Mono({
	variable: "--font-roboto-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"]
});

const raleway = Raleway({
	variable: "--font-raleway",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800", "900"]
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
			splashBackgroundColor: "#000000"
		}
	}
};

export const metadata: Metadata = {
	title: "Lemon Markets",
	description: "A decentralized trading platform for perpetual futures",
	other: {
		"fc:miniapp": JSON.stringify(miniAppEmbed),
		"fc:frame": JSON.stringify(miniAppEmbed)
	},
	openGraph: {
		title: "Lemon Markets - Decentralized Perpetual Trading",
		description:
			"Trade perpetual futures with leverage on a decentralized platform",
		images: ["https://demo.lemonmarkets.xyz/image/features-image.png"]
	}
};

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://auth.farcaster.xyz" />
			</head>
			<body
				className={`${inter.variable} ${robotoMono.variable} ${raleway.className} antialiased bg-black text-foreground`}
			>
				<BProgressProvider />
				<MiniAppProvider>
					<ToastProvider>
						<WalletProvider>
							<AppProvider>
								<Header />
								{children}
							</AppProvider>
						</WalletProvider>
					</ToastProvider>
				</MiniAppProvider>
			</body>
		</html>
	);
}
