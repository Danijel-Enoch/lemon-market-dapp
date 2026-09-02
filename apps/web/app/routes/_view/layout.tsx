import { Outlet } from "react-router";

export default function ViewLayout() {
	return (
		<div className="min-h-screen pt-24 md:pt-28">
			<main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:pb-12">
				<Outlet />
			</main>
		</div>
	);
}
