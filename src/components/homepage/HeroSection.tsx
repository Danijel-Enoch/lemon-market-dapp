import Image from "next/image";
import Link from "next/link";
import type { FC } from "react";

export const HeroSection: FC = () => {
	return (
		<section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
			<div className="absolute inset-0 pointer-events-none">
				<Image
					src="/assets/homepage/hero-wedge.svg"
					alt="Hero background"
					priority
					fill
					sizes="100vw"
					className="object-cover object-center opacity-40"
				/>
				{/* <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" /> */}
				<div className="absolute inset-x-0 bottom-0 h-[25%] [background:linear-gradient(to_bottom,#00453000_0%,#012E01_50%,#000_100%)] mix-blend-multiply opacity-90" />
			</div>

			<div className="relative z-10 max-w-screen-xl mx-auto px-6 mt-28 md:px-10 flex flex-col items-center text-center gap-6">
				<h1 className="text-4xl md:text-6xl font-extrabold leading-tight bg-gradient-to-b from-white to-gray-200 bg-clip-text text-transparent">
					Unlimited Markets.
					<br />
					Unlimited Opportunities.
				</h1>
				<p className="text-lg md:text-xl text-white/80 max-w-2xl">
					Trade any asset class with up to 100x leverage on the most efficient decentralized perpetual protocol
				</p>
				<Link
					href="/perp"
					className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-base font-semibold bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 active:scale-[0.98]"
				>
					Start Trading
				</Link>
				<p className="mt-72 text-sm text-white/60">Powering over $50M in daily trading volume</p>
			</div>
		</section>
	);
};
