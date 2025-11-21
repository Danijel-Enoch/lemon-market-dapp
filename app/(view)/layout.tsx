import type { ReactNode } from "react";
import TopTicker from "@/components/layout/TopTicker";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ViewLayout({ children }: { children: ReactNode }) {
	return (
		<div>
			<div className="min-h-screen pt-24 md:pt-32">
				<main className="container mx-auto px-4 py-8">
					<TopTicker />
					{children}
				</main>
			</div>
		</div>
	);
}
