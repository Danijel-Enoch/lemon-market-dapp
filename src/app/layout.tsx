import type { Metadata } from "next";
import { Inter, Raleway, Roboto_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { AppProvider } from "@/contexts/AppContext";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
});

const robotoMono = Roboto_Mono({
    variable: "--font-roboto-mono",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const raleway = Raleway({
    variable: "--font-raleway",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
    title: "Lemon Markets",
    description: "A decentralized trading platform",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${robotoMono.variable} ${raleway.className} antialiased bg-black text-foreground`}
            >
                <ToastProvider>
                    <WalletProvider>
                        <AppProvider>
                            <Header />
                            {children}
                        </AppProvider>
                    </WalletProvider>
                </ToastProvider>
            </body>
        </html>
    );
}
