import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import TopTicker from "@/components/layout/TopTicker";

export default function ViewLayout({ children }: { children: ReactNode }) {
	const location = useLocation();
	const isTrending = location.pathname === "/trending";

	return (
		<div>
			<div className="min-h-screen pt-24 md:pt-32">
				<main className="sm:container sm:mx-auto sm:p-4 mb-32 sm:mb-8">
					<TopTicker />
					<div className={isTrending ? "" : "px-4"}>{children}</div>
				</main>
			</div>
		</div>
	);
}
