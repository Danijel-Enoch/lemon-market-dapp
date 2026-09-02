import { MiniAppProvider } from "@app/components/providers/MiniAppProvider";
import { ToastProvider } from "@app/components/providers/ToastProvider";
import { WalletProvider } from "@app/components/providers/WalletProvider";
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
				{/* Wagmi must wrap everything that reads wallet state, including the header. */}
				<WalletProvider>
					<ToastProvider>
						<Outlet />
					</ToastProvider>
				</WalletProvider>
			</MiniAppProvider>
		</PostHogProvider>
	);
}
