import { Outlet } from "react-router";
import { FaucetBanner } from "@app/components/layout/FaucetBanner";
import { Header } from "@app/components/layout/Header";
import { ReferralHandler } from "@app/components/providers/ReferralHandler";

export default function RootLayout() {
	return (
		<>
			<ReferralHandler />
			<FaucetBanner />
			<Header />
			<Outlet />
		</>
	);
}
