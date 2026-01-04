import { FaucetBanner } from "@app/components/layout/FaucetBanner";
import { Header } from "@app/components/layout/Header";
import { MiniAppProvider } from "@app/components/providers/MiniAppProvider";
import { ReferralHandler } from "@app/components/providers/ReferralHandler";
import { ToastProvider } from "@app/components/providers/ToastProvider";
import { AppProvider } from "@app/contexts/AppContext";
import { PostHogProvider } from "posthog-js/react";
import { Outlet } from "react-router";

const posthogOptions = {
	api_host: "https://us.i.posthog.com",
	defaults: "2025-11-30",
} as const;

export default function RootLayout() {
	return (
		<PostHogProvider
			apiKey={"phc_3yzfWThidiuKV0AbmI2r7WOrtSx0PEAcGdDbQujHyl5"}
			options={posthogOptions}
		>
			<MiniAppProvider>
				<ToastProvider>
					<AppProvider>
						<ReferralHandler />
						<FaucetBanner />
						<Header />
						<Outlet />
					</AppProvider>
				</ToastProvider>
			</MiniAppProvider>
		</PostHogProvider>
	);
}
