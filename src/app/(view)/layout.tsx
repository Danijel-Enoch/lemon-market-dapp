import type { ReactNode } from "react";
import TopTicker from "@/components/layout/TopTicker";

export default function ViewLayout({ children }: { children: ReactNode }) {
	return (
		<div>
			<div className="min-h-screen pt-24 md:pt-32">
				<main className="sm:container sm:mx-auto sm:px-4 sm:py-8">
					<TopTicker />
					{children}
				</main>
			</div>
		</div>
	);
}
