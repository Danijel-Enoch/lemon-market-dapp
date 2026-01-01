import type { FC } from "react";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

export const HeroSection: FC = () => {
	return (
		<section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
			<div className="absolute inset-0 pointer-events-none">
				<img
					src="/assets/homepage/hero-wedge.svg"
					alt="Hero background"
					sizes="100vw"
					className="object-cover object-center w-full h-dvh"
				/>
				<div className="absolute inset-x-0 bottom-0 h-[25%] [background:linear-gradient(to_bottom,#00453000_0%,#012E01_50%,#000_100%)] mix-blend-multiply opacity-90" />
			</div>

			<div className="relative z-10 max-w-7xl mx-auto px-6 mt-28 md:mt-40 md:px-10 flex flex-col items-center text-center gap-6">
				<h1 className="text-3xl md:text-5xl lg:text-6xl font-medium leading-tight bg-linear-to-b from-white to-gray-200 bg-clip-text text-transparent animate-fade-up animate-delay-100 tracking-tight">
					Unlimited Markets.
					<br />
					Unlimited Opportunities.
				</h1>
				<p className="text-md md:text-xl text-white/80 max-w-2xl animate-fade-up animate-delay-300">
					Trade any asset class with up to 100x leverage on the most efficient decentralized
					perpetual protocol
				</p>
				<div className="flex items-center gap-4">
					<ConnectWallet text="Start Trading" connectedNode="Start Trading" href="/perp" />
					<a
						href="https://t.me/lemonMarketsBot"
						className="rounded-xl border border-white/60 bg-[#004530]/60 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm"
					>
						Claim Faucet
					</a>
				</div>
				<div className="mt-[40vh] sm:mt-[30vh] overflow-hidden animate-fade-up animate-delay-700">
					<div className="flex animate-scroll-ticker space-x-8">
						{/* <img
							src="/assets/homepage/partners-btc.svg"
							alt="Bitcoin"
							width={40}
							height={40}
							className="opacity-60 hover:opacity-100 transition-opacity"
						/> */}
					</div>
				</div>
			</div>
		</section>
	);
};
