import { Header } from "@app/components/layout/Header";
import { FirstRun } from "@app/components/onboarding/FirstRun";
import { TourProvider } from "@app/components/tour/TourProvider";
import { WrongNetworkBanner } from "@lemon/wallet";
import { Outlet } from "react-router";

/**
 * Application shell.
 *
 * The Pons nav floats as a pill rather than sitting in a bar, so the shell
 * reserves its full height as padding rather than relying on a fixed bar
 * height. The bottom tab bar reserves space below it on mobile.
 *
 * `TourProvider` wraps the outlet rather than sitting beside it: the
 * walkthrough spotlights elements inside the routed page and navigates between
 * them, so it has to be inside the router and outside the page that changes.
 *
 * The network banner lives here rather than in `Header` so it can take a full
 * content-width row. It renders nothing at all until a connected wallet is on
 * the wrong chain, which on a mainnet build is almost never.
 */
export default function ViewLayout() {
	return (
		<TourProvider>
			<div className="min-h-screen bg-[var(--pon-bg)] pt-[60px] md:pt-[78px]">
				<Header />
				<main className="mx-auto w-full max-w-[var(--shell-max)] px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4 sm:pb-14 md:px-6 md:pt-6">
					{/* Above the page, not instead of it: the board, the vault pages and
					    the activity feed all read from the indexer and are correct
					    whatever the wallet is connected to. Only depositing and
					    withdrawing need the right chain. */}
					<WrongNetworkBanner className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] px-4 py-3" />
					<Outlet />
				</main>
				<FirstRun />
			</div>
		</TourProvider>
	);
}
