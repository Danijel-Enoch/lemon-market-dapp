import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { AppProvider } from "@/contexts/AppContext";
import { ToastProvider } from "@/components/providers/ToastProvider";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"]
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"]
});

export const metadata: Metadata = {
	title: "Lemon Loopa",
	description: "A decentralized trading platform"
};

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
			>
				<ToastProvider>
					<WalletProvider>
						<AppProvider>{children}</AppProvider>
					</WalletProvider>
				</ToastProvider>
			</body>
		</html>
	);
}
