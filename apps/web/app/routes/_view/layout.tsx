import { Header } from "@app/components/layout/Header";
import { Outlet } from "react-router";

/**
 * Application shell.
 *
 * The Pons nav floats as a pill rather than sitting in a bar, so the shell
 * reserves its full height as padding rather than relying on a fixed bar
 * height. The bottom tab bar reserves space below it on mobile.
 */
export default function ViewLayout() {
	return (
		<div className="min-h-screen bg-[var(--pon-bg)] pt-[64px] md:pt-[78px]">
			<Header />
			<main className="mx-auto w-full max-w-[var(--shell-max)] px-4 pb-28 pt-5 sm:pb-14 md:px-6 md:pt-6">
				<Outlet />
			</main>
		</div>
	);
}
