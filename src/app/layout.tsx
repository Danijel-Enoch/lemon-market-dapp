import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { AppProvider } from "@/contexts/AppContext";

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

export const metadata: Metadata = {
    title: "Lemon Loopa",
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
                className={`${inter.variable} ${robotoMono.variable} antialiased bg-background text-foreground`}
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
