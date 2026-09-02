import { Header } from "@app/components/layout/Header";
import { Outlet } from "react-router";

/**
 * Application shell.
 *
 * Avantis runs its app surfaces edge to edge under a 56px fixed bar, with the
 * mobile tab bar reserving space at the bottom — no centred marketing gutter.
 */
export default function ViewLayout() {
	return (
		<div className="min-h-screen bg-black pt-[57px] md:pt-[56px]">
			<Header />
			<main className="mx-auto w-full max-w-[var(--shell-max)] px-4 pb-24 pt-6 sm:pb-12 md:px-6">
				<Outlet />
			</main>
		</div>
	);
}
