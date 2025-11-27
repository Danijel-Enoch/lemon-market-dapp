import { Header } from "@/components/layout/Header";
// import { BProgressProvider } from "@/components/providers/BProgressProvider";
import { MiniAppProvider } from "@/components/providers/MiniAppProvider";
import { PageTransition } from "@/components/providers/PageTransition";
import { ReferralHandler } from "@/components/providers/ReferralHandler";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { AppProvider } from "@/contexts/AppContext";
import "./globals.css";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<MiniAppProvider>
			<ToastProvider>
				<AppProvider>
					<ReferralHandler />
					{/* <BProgressProvider> */}
					<Header />
					<PageTransition>{children}</PageTransition>
					{/* </BProgressProvider> */}
				</AppProvider>
			</ToastProvider>
		</MiniAppProvider>
	);
}
