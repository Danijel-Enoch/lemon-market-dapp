import Image from "next/image";
import type { FC } from "react";
import { FeatureCard } from "./FeatureCard";

export const FeaturesSection: FC = () => {
	return (
		<section className="py-20 px-6 md:px-10 max-w-7xl mx-auto">
			<div className="text-center mb-12">
				<div className="inline-flex items-center gap-8">
					<Image
						src="/assets/homepage/section-features-divider.png"
						alt="Divider"
						width={72}
						height={10}
						loading="lazy"
						sizes="72px"
						className="opacity-90"
					/>
					<span className="text-[#9DEA29] font-medium text-sm leading-[19px]">Features</span>
					<Image
						src="/assets/homepage/section-features-divider.png"
						alt="Divider"
						width={72}
						height={10}
						loading="lazy"
						sizes="72px"
						className="opacity-90 rotate-180"
					/>
				</div>
				<h2 className="mt-6 text-4xl md:text-5xl font-semibold bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
					Built For Infinite Markets
				</h2>
				<p className="mt-3 text-white/70 max-w-2xl mx-auto">
					Trade with confidence through the most efficient on-chain perpetual protocol.
				</p>
			</div>

			<div className="relative mb-8">
				{/* Green glow effect - visible only on desktop */}
				<div className="hidden md:block absolute inset-0 pointer-events-none overflow-hidden">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-96 bg-[#9DEA29]/70 rounded-full blur-[80px]" />
				</div>

				{/* Feature cards */}
				<div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					<FeatureCard
						iconSrc="/assets/homepage/feature-icon-liquidity.png"
						alt="Liquidity icon"
						title="Unified Liquidity Model"
						description="All trades settle against a shared collateral reserve, unlocking deeper liquidity and capital efficiency across every asset."
					/>
					<FeatureCard
						iconSrc="/assets/homepage/feature-icon-synthetic.png"
						alt="Synthetic icon"
						title="Synthetic Asset Support"
						description="Access perpetual markets for crypto, forex, and commodities without depending on fragmented DEX liquidity."
					/>
					<FeatureCard
						iconSrc="/assets/homepage/feature-icon-oracle.png"
						alt="Oracle icon"
						title="Oracle-Powered Precision"
						description="Reliable, cryptographically verified price data keeps every trade fair and secured."
					/>
				</div>
			</div>
		</section>
	);
};
