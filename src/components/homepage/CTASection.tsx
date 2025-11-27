import type { FC } from "react";
import { Link } from "react-router-dom";

export const CTASection: FC = () => {
	return (
		<section className="py-20 px-6 md:px-10 flex flex-col items-center text-center">
			<h2 className="max-w-3xl text-4xl md:text-5xl font-medium bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
				Make more profits from Unlimited Opportunities
			</h2>
			{/* <p className="mt-3 text-white/70 max-w-2xl mx-auto">
				Make more profits from Unlimited Opportunities
			</p> */}
			<Link
				to="/perp"
				className="mt-8 inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-4 text-base font-semibold bg-linear-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 active:scale-[0.98]"
			>
				Launch App
			</Link>
		</section>
	);
};
