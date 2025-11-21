import Image from "next/image";
import type { FC } from "react";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

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
					className="object-cover object-center"
				/>
				<div className="absolute inset-x-0 bottom-0 h-[25%] [background:linear-gradient(to_bottom,#00453000_0%,#012E01_50%,#000_100%)] mix-blend-multiply opacity-90" />
			</div>

			<div className="relative z-10 max-w-7xl mx-auto px-6 mt-28 md:px-10 flex flex-col items-center text-center gap-6">
				<h1 className="text-4xl md:text-6xl font-medium leading-tight bg-linear-to-b from-white to-gray-200 bg-clip-text text-transparent animate-fade-up animate-delay-100">
					Unlimited Markets.
					<br />
					Unlimited Opportunities.
				</h1>
				<p className="text-lg md:text-xl text-white/80 max-w-2xl animate-fade-up animate-delay-300">
					Trade any asset class with up to 100x leverage on the most efficient decentralized
					perpetual protocol
				</p>
				<ConnectWallet text="Start Trading" connectedNode="Start Trading" href="/perp" />
				<p className="mt-72 text-sm text-white/60 animate-fade-up animate-delay-700">
					Powering over $50M in daily trading volume
				</p>
			</div>
		</section>
	);
};
