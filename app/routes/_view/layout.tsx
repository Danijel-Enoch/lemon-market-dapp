import TopTicker from "@app/components/layout/TopTicker";
import { Outlet, useLocation } from "react-router";

export default function ViewLayout() {
	const location = useLocation();
	const isTrending = location.pathname === "/trending";

	return (
		<div>
			<div className="min-h-screen pt-24 md:pt-32">
				<main className="sm:container sm:mx-auto sm:p-4 mb-32 sm:mb-8">
					<TopTicker />
					<div className={isTrending ? "" : "px-4"}>
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
