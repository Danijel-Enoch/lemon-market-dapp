import { Footer } from "@app/components/layout/Footer";
import { Header } from "@app/components/layout/Header";
import { FirstRun } from "@app/components/onboarding/FirstRun";
import { TourProvider } from "@app/components/tour/TourProvider";
import { WrongNetworkBanner } from "@lemon/wallet";
import { Outlet } from "react-router";

/**
 * Application shell.
 *
 * The page is a ruled sheet: one flat field, two vertical rules running its
 * full height at the edges of the content column, and every section closed by
 * a horizontal hairline. `firm-rules` paints the verticals behind everything
 * on a fixed layer, so they stay put while the page scrolls past them — the
 * detail that makes the layout read as a printed page rather than as a stack
 * of cards.
 *
 * The header is a fixed masthead with the ticker under it, so the shell
 * reserves both as top padding. The bottom tab bar reserves space below it on
 * mobile.
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
			<div className="relative flex min-h-screen flex-col bg-[var(--pon-bg)] pt-[70px] md:pt-[80px]">
				<div aria-hidden className="firm-rules" />

				<Header />

				<main className="relative z-10 mx-auto w-full max-w-[var(--rule-max)] flex-1 px-5 pt-6 pb-[calc(76px+env(safe-area-inset-bottom))] md:px-8 md:pt-10 md:pb-20">
					{/* Above the page, not instead of it: the board, the vault pages and
					    the activity feed all read from the indexer and are correct
					    whatever the wallet is connected to. Only depositing and
					    withdrawing need the right chain. */}
					<WrongNetworkBanner className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-lg)] border border-[var(--pon-down)] px-4 py-3" />
					<Outlet />
				</main>

				{/* The tab bar covers the foot of the page on mobile, so the footer
				    only shows where there is room for it. */}
				<div className="hidden md:block">
					<Footer />
				</div>

				<FirstRun />
			</div>
		</TourProvider>
	);
}
