import { AdminSignIn } from "@app/components/AdminSignIn";
import { Brand, ThemeToggle } from "@lemon/ui";
import { WrongNetworkBanner } from "@lemon/wallet";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Outlet } from "react-router";

/**
 * The console shell.
 *
 * One bar, no navigation: the dashboard is a single page with tabs, and a nav
 * row holding one link is worse than none. What the bar does carry is the
 * connected wallet, because every write on this page spends the operator's own
 * funds and they should be able to see which account is about to do it.
 *
 * The network banner sits above the content rather than replacing it. Every
 * number on this page comes from the indexer, not the wallet, so a wrong network
 * breaks the buttons and nothing else — hiding the dashboard to complain about
 * it would take away the information the operator opened it for.
 */
export default function ViewLayout() {
	return (
		<div className="min-h-dvh bg-[var(--pon-bg)]">
			<header className="sticky top-0 z-50 border-b border-[var(--pon-line-2)] bg-[var(--pon-bg)]">
				<div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-4 px-4 py-2.5">
					<div className="flex items-center gap-3">
						<Brand size={24} />
						<span className="firm-label rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] px-2 py-0.5 text-[var(--pon-fg-3)]">
							Operator
						</span>
					</div>

					<div className="flex items-center gap-3">
						<ThemeToggle />
						{/* Connecting proves nothing to the API; signing does. The two
						    sit together so the second step is where the first ends. */}
						<AdminSignIn />
						<ConnectButton
							accountStatus="address"
							chainStatus="icon"
							showBalance={false}
							label="Connect"
						/>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-[var(--shell-max)] space-y-4 px-4 py-6 md:py-8">
				<WrongNetworkBanner />
				<Outlet />
			</main>
		</div>
	);
}
