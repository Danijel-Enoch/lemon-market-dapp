import Link from "next/link";
import type { FC } from "react";

export const CTASection: FC = () => {
	return (
		<section className="py-20 px-6 md:px-10 text-center">
			<h2 className="text-4xl md:text-5xl font-bold bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
				Take Control. Start Today
			</h2>
			<p className="mt-3 text-white/70 max-w-2xl mx-auto">
				Join thousands trading perpetuals with Lemon Markets. Simple setup, powerful tools, total
				confidence.
			</p>
			<Link
				href="/perp"
				className="mt-8 inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-4 text-base font-semibold bg-linear-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 active:scale-[0.98]"
			>
				Launch App
			</Link>
		</section>
	);
};
