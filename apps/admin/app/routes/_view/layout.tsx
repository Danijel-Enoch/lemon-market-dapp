import { Brand } from "@lemon/ui";
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
			<header className="sticky top-0 z-50 border-b border-[var(--pon-line)] bg-[var(--pon-bg)]/90 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-4 px-4 py-3">
					<div className="flex items-center gap-3">
						<Brand size={24} />
						<span className="rounded-full border border-[var(--pon-line-2)] px-2 py-0.5 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase">
							Operator
						</span>
					</div>

					<ConnectButton
						accountStatus="address"
						chainStatus="icon"
						showBalance={false}
						label="Connect"
					/>
				</div>
			</header>

			<main className="mx-auto w-full max-w-[var(--shell-max)] space-y-4 px-4 py-6 md:py-8">
				<WrongNetworkBanner />
				<Outlet />
			</main>
		</div>
	);
}
