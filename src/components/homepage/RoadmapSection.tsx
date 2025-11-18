"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { FC } from "react";

type PhaseStatus = "done" | "now" | "next";

interface Phase {
	phase: string;
	when: string;
	what: string;
	status: PhaseStatus;
	things: string[];
}

const phases: Phase[] = [
	{
		phase: "Phase I",
		when: "Q4 2024",
		what: "Foundation & Infrastructure",
		status: "done",
		things: [
			"Deploy multi-chain support across Ethereum, Bitcoin, and EVM-compatible networks.",
			"Integrate Chainlink oracles and verified market data feeds.",
			"Conduct independent security audits to guarantee protocol integrity.",
			"Build the base liquidity engine for synthetic asset trading.",
		],
	},
	{
		phase: "Phase II",
		when: "Q1 2025",
		what: "Platform Enhancement",
		status: "now",
		things: [
			"Launch AI-driven analytics dashboards to surface market insights and trading intelligence.",
			"Roll out cross-chain swaps and portfolio rebalancing features.",
			"Optimise UI/UX and backend systems for high-speed, low-latency performance.",
			"Begin controlled user onboarding (1,000+ early testers).",
		],
	},
	{
		phase: "Phase III",
		when: "Q2 2025",
		what: "Market Expansion",
		status: "next",
		things: [
			"FX Markets — Add major currency pairs: EUR/USD, GBP/USD, USD/JPY.",
			"Introduce exotic pairs and emerging market currencies for broader exposure.",
			"Integrate real-time FX data feeds for transparency and precision.",
			"Commodities — Enable synthetic trading for Gold, Silver, Platinum; add Energy and Agricultural assets.",
		],
	},
	{
		phase: "Phase IV",
		when: "Q3 2025",
		what: "Ecosystem Integration",
		status: "next",
		things: [
			"Integrate DeFi protocols (Uniswap, Aave) and Layer-2 networks.",
			"Add staking, governance, and institutional tools.",
		],
	},
];

export const RoadmapSection: FC = () => {
	return (
		<section className="py-24 px-6 max-w-7xl mx-auto relative">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<div className="absolute top-20 -left-20 w-96 h-96 bg-[#9DEA29]/5 rounded-full blur-3xl" />
				<div className="absolute bottom-20 -right-20 w-96 h-96 bg-[#9DEA29]/5 rounded-full blur-3xl" />
			</div>

			<div className="mb-20 flex flex-col items-center text-center">
				<div className="flex items-center gap-6 mb-6">
					<Image
						src="/assets/homepage/section-features-divider.png"
						alt=""
						width={60}
						height={8}
						className="opacity-80"
					/>
					<span className="text-[#9DEA29] font-medium text-sm tracking-wide">Goals</span>
					<Image
						src="/assets/homepage/section-features-divider.png"
						alt=""
						width={60}
						height={8}
						className="opacity-80 rotate-180"
					/>
				</div>
				<h2 className="text-4xl md:text-6xl font-bold text-white mb-4">Roadmap</h2>
				<p className="text-white/60 text-lg max-w-2xl">
					Each phase brings us closer to a fully decentralized trading ecosystem
				</p>
			</div>

			<div className="relative">
				{/* Vertical timeline line */}
				<div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#9DEA29]/20 via-[#9DEA29]/40 to-[#9DEA29]/20 -translate-x-1/2" />

				<div className="space-y-16">
					{phases.map((phase, idx) => {
						const isDone = phase.status === "done";
						const isNow = phase.status === "now";
						const isLeft = idx % 2 === 0;

						return (
							<motion.div
								key={phase.phase}
								initial={{ opacity: 0, y: 30 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-80px" }}
								transition={{ delay: idx * 0.1 }}
								className={`relative flex ${isLeft ? "md:justify-start" : "md:justify-end"}`}
							>
								{/* Branch line connecting from timeline to phase */}
								<div
									className={`hidden md:block absolute top-6 ${isLeft ? "right-1/2 left-auto" : "left-1/2 right-auto"} w-12 h-px bg-[#9DEA29]/30`}
								/>

								{/* Timeline dot */}
								<div className="absolute left-8 md:left-1/2 top-6 w-4 h-4 -translate-x-1/2 z-10">
									<div
										className={`w-full h-full rounded-full border-2 transition-all ${
											isDone
												? "bg-[#9DEA29] border-[#9DEA29] shadow-lg shadow-[#9DEA29]/50"
												: isNow
													? "bg-[#9DEA29] border-[#9DEA29] animate-pulse"
													: "bg-neutral-900 border-white/30"
										}`}
									/>
								</div>

								<div
									className={`pl-20 md:pl-0 md:w-[calc(50%-3rem)] ${isLeft ? "md:pl-16 md:flex md:flex-col md:items-end" : "md:pr-16"}`}
								>
									{/* Title box */}
									<div className="inline-block mb-6 p-4 border border-white/20 bg-neutral-900/60 backdrop-blur-sm hover:border-[#9DEA29]/40 transition-colors">
										<div className="flex items-baseline gap-3 mb-1">
											<span className="text-sm font-mono text-white/50">{phase.phase}</span>
											<span className="text-sm font-mono text-[#9DEA29]/70">• {phase.when}</span>
										</div>
										<h3 className="text-2xl font-bold text-white">{phase.what}</h3>
										{isDone && (
											<span className="inline-block mt-2 text-xs px-2 py-1 bg-[#9DEA29]/10 text-[#9DEA29] border border-[#9DEA29]/20">
												Completed
											</span>
										)}
										{isNow && (
											<span className="inline-block mt-2 text-xs px-2 py-1 bg-[#9DEA29]/10 text-[#9DEA29] border border-[#9DEA29]/20">
												In Progress
											</span>
										)}
									</div>

									{/* Items list - no wrapper */}
									<div className={`space-y-3 ${isLeft ? "md:text-right" : ""}`}>
										{phase.things.map((thing, i) => (
											<motion.div
												key={i}
												initial={{ opacity: 0, x: -10 }}
												whileInView={{ opacity: 1, x: 0 }}
												viewport={{ once: true }}
												transition={{ delay: idx * 0.1 + i * 0.05 }}
												className={`flex gap-3 text-white/70 text-[15px] leading-relaxed ${isLeft ? "md:flex-row-reverse" : ""}`}
											>
												<span className="text-[#9DEA29]/60 mt-1 select-none">
													{isLeft ? "←" : "→"}
												</span>
												<span>{thing}</span>
											</motion.div>
										))}
									</div>
								</div>
							</motion.div>
						);
					})}
				</div>
			</div>

			<motion.div
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				className="mt-16 text-center"
			>
				<p className="text-white/40 text-sm">
					This roadmap evolves with market needs and community feedback
				</p>
			</motion.div>
		</section>
	);
};
