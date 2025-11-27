"use client";

import { motion } from "framer-motion";
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
		phase: "MVP to Production",
		when: "November 2025 - March 2026",
		what: "From MVP to Market Leader",
		status: "now",
		things: [
			"Token Launch Preparation: Complete token economics and distribution model, regulatory compliance and token structure, community education and engagement, token contract deployment and testing",
			"Testnet Trading Campaign: Rewards structure and participation mechanics, enhanced testnet performance and features, community engagement and social media drives, bug bounty integration for incentivized testing",
			"Airdrop Execution: Define eligibility criteria and communicate requirements, prepare user activity snapshots and distribution calculations, build secure distribution infrastructure, establish clear community communication and claim process",
			"MVP Enhancement: Performance optimization for faster trade execution and reduced gas costs, UI/UX improvements based on MVP feedback, mobile responsiveness optimization, security hardening with additional measures",
			"Advanced Features Development: Gasless trading foundation with meta-transactions, copy trading backend infrastructure, delta-neutral vault prototypes, Base chain integration preparation",
			"Success Metrics: Token launched, testnet campaign complete, airdrop distributed, MVP feedback integrated, enhanced UX live, mobile optimization, 10,000+ testnet participants, successful token distribution, active community, $10M+ TVL post-token launch, 1,000+ active traders, sustainable trading volume",
		],
	},
	{
		phase: "Q2 2026: Advanced Trading Features",
		when: "April - June 2026",
		what: "Feature Expansion",
		status: "next",
		things: [
			"Copy Trading Full Launch: Complete trader profiles with performance tracking and social features, one-click following system with risk controls, automated revenue sharing for successful traders, advanced performance analytics for traders and followers",
			"Gasless Trading Rollout: Full implementation of gas abstraction across all features, seamless user onboarding without gas friction, cost optimization through efficient gas sponsorship, mobile integration for gasless trading experience",
			"Delta-Neutral Vaults Launch: Automated market-neutral yield strategies through funding arbitrage, professional vault operators and management, advanced risk controls and monitoring systems, yield optimization with multiple strategy options for different risk profiles",
			"Success Metrics: Copy trading live, gasless trading operational, vaults launched, 500+ copy traders, full gasless experience, 50+ vault strategies, 25,000 active users, strong social trading community, $100M TVL, $2M daily volume, vault deposits growing",
		],
	},
	{
		phase: "Q3 2026: Institutional & Cross-Chain",
		when: "July - September 2026",
		what: "Enterprise Scale",
		status: "next",
		things: [
			"Multi-Chain Expansion: Full Ethereum mainnet deployment, Arbitrum & Optimism Layer 2 expansion, unified cross-chain liquidity, seamless bridge integration for asset movement",
			"Institutional Features: High-throughput enterprise APIs, institutional custody integration, advanced compliance tools and reporting, white-label solutions for institutional clients",
			"Professional Trading Tools: Advanced order types (limit, stop-loss, conditional), algorithmic trading execution and management, portfolio-level risk controls and limits, professional market making tools",
			"Institutional Vaults: Professional managed funds, custom tailored investment strategies, full regulatory compliance, institutional-grade performance reporting and analytics",
			"Success Metrics: Multi-chain operational, enterprise APIs live, institutional features complete, professional tools available, 50,000 users, 20 institutional clients, $1B TVL, institutional revenue streams established",
		],
	},
	{
		phase: "Q4 2026: Governance & Decentralization",
		when: "October - December 2026",
		what: "Community Ownership",
		status: "next",
		things: [
			"DAO Implementation: Community governance token launch, decentralized voting mechanisms, community-controlled treasury management, transition to decentralized operations",
			"Protocol Optimization: Community-driven fee structure adjustments, feature prioritization through voting, ongoing security enhancements and audits, performance scaling for growing user base",
			"Community Features: Governance dashboard for voting and proposal management, token incentives for participation, developer ecosystem with grants and support, transition to fully open-source development",
			"Advanced Strategies: AI-powered trading strategy vaults, cross-protocol integration with major DeFi protocols, support for exotic markets and prediction markets, global expansion with worldwide market support",
			"Success Metrics: Full decentralization achieved, governance operational, community governance live, AI strategies deployed, 100,000 users, active DAO participation, $5B TVL, self-sustaining ecosystem",
		],
	},
];

export const RoadmapSection: FC = () => {
	return (
		<section className="py-24 max-w-7xl mx-auto relative">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<div className="absolute top-20 -left-20 w-96 h-96 bg-[#9DEA29]/5 rounded-full blur-3xl" />
				<div className="absolute bottom-20 -right-20 w-96 h-96 bg-[#9DEA29]/5 rounded-full blur-3xl" />
			</div>

			<div className="mb-20 flex flex-col items-center text-center">
				<div className="flex items-center gap-6 mb-6">
					<img
						src="/assets/homepage/section-features-divider.png"
						alt=""
						width={60}
						height={8}
						className="opacity-80"
					/>
					<span className="text-[#9DEA29] font-medium text-sm tracking-wide">Goals</span>
					<img
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
				<div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-linear-to-b from-[#9DEA29]/20 via-[#9DEA29]/40 to-[#9DEA29]/20 -translate-x-1/2" />

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
								viewport={{ once: false, margin: "-80px" }}
								transition={{ delay: idx * 0.1 }}
								className={`relative flex ${isLeft ? "md:justify-start" : "md:justify-end"}`}
							>
								<div
									className={`hidden md:block absolute top-6 ${isLeft ? "right-1/2 left-auto" : "left-1/2 right-auto"} w-12 h-px bg-[#9DEA29]/30`}
								/>

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
									<div className="inline-block mb-6 py-2 px-4 border border-white/20 bg-neutral-900/60 backdrop-blur-sm hover:border-[#9DEA29]/40 transition-colors rounded-lg">
										<div className="flex items-baseline gap-3 mb-1">
											<span className="text-sm font-mono text-white/50">{phase.phase}</span>
											{/* <span className="text-sm font-mono text-[#9DEA29]/70">• {phase.when}</span> */}
											{isDone && (
												<span className="inline-block mt-2 text-xs px-2 py-1 bg-[#9DEA29]/10 text-[#9DEA29] border border-[#9DEA29]/20 rounded-lg">
													Completed
												</span>
											)}
											{isNow && (
												<span className="inline-block mt-2 text-xs px-2 py-1 bg-[#9DEA29]/10 text-[#9DEA29] border border-[#9DEA29]/20 rounded-lg">
													In Progress
												</span>
											)}
										</div>
									</div>

									<div className={`space-y-3 ${isLeft ? "md:text-right" : ""}`}>
										{phase.things.map((thing, i) => (
											<motion.div
												key={`${phase.phase}-thing-${i}-${thing.slice(0, 15).replace(/\s+/g, "-")}`}
												initial={{ opacity: 0, x: -10 }}
												whileInView={{ opacity: 1, x: 0 }}
												viewport={{ once: false }}
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
				viewport={{ once: false }}
				className="mt-16 text-center"
			>
				<p className="text-white/40 text-sm">
					This roadmap evolves with market needs and community feedback
				</p>
			</motion.div>
		</section>
	);
};
