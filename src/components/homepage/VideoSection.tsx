import Image from "next/image";
import type { FC } from "react";

export const VideoSection: FC = () => {
	return (
		<section className="py-16 px-6 md:px-10 max-w-5xl mx-auto text-center">
			<div className="inline-flex items-center gap-8">
				<Image
					src="/assets/homepage/section-features-divider.png"
					alt="Divider"
					width={72}
					height={10}
					className="opacity-90"
				/>
				<span className="text-[#9DEA29] font-medium text-sm leading-[19px]">Features</span>
				<Image
					src="/assets/homepage/section-features-divider.png"
					alt="Divider"
					width={72}
					height={10}
					className="opacity-90 rotate-180"
				/>
			</div>
			<h3 className="mt-6 text-3xl md:text-4xl font-bold bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
				See Lemon Markets in Action
			</h3>
			<p className="mt-3 text-white/70 max-w-2xl mx-auto">
				Discover how our unified liquidity model and oracle-powered pricing deliver unmatched
				trading performance across all asset classes.
			</p>
			<div className="mt-10 rounded-3xl overflow-hidden border border-lime-400">
				<Image
					src="/assets/homepage/video-placeholder.svg"
					alt="Video"
					width={1024}
					height={776}
					className="w-full h-auto cursor-pointer"
				/>
			</div>
		</section>
	);
};
