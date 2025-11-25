"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { FC } from "react";

const testimonials = [
	{
		quote:
			"Lemon Markets has completely changed my trading strategy. The ability to trade perpetuals across multiple chains with such deep liquidity is a game-changer.",
		author: "Sarah Chen",
		role: "DeFi Trader",
		avatar: "/assets/homepage/testimonial-1.png",
	},
	{
		quote:
			"Finally, a perpetual DEX that doesn't compromise on execution speed or price accuracy. The oracle integration is seamless and reliable.",
		author: "Marcus Rodriguez",
		role: "Quant Analyst",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"I've been trading on Lemon Markets for months now. The unified liquidity model means I can trade exotic pairs without worrying about slippage.",
		author: "Kenji Tanaka",
		role: "Portfolio Manager",
		avatar: "/assets/homepage/testimonial-3.png",
	},
	{
		quote:
			"The synthetic asset support is incredible. I can now trade forex and commodities alongside my crypto positions all in one place.",
		author: "Elena Volkov",
		role: "Crypto Investor",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"Best leverage trading platform I've used. Clean UI, fast execution, and the capital efficiency is unmatched. Highly recommended!",
		author: "James Thompson",
		role: "Day Trader",
		avatar: "/assets/homepage/testimonial-3.png",
	},
	{
		quote:
			"As a professional trader, I need reliability and transparency. Lemon Markets delivers on both fronts with their oracle-powered pricing.",
		author: "Aisha Patel",
		role: "Crypto Fund Manager",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"The multi-chain support is what drew me in, but the low fees and deep liquidity are what kept me. This is the future of DeFi trading.",
		author: "Lucas Schmidt",
		role: "Blockchain Developer",
		avatar: "/assets/homepage/testimonial-3.png",
	},
];

export const TestimonialsSection: FC = () => {
	return (
		<section className="py-16 px-6 md:px-10 max-w-7xl mx-auto">
			<div className="grid lg:grid-cols-2 gap-10 items-center">
				<div>
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
						<span className="text-[#9DEA29] font-medium text-sm leading-[19px]">Testimonials</span>
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
					<div className="mt-6">
						<h3 className="text-3xl md:text-4xl font-bold bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
							Trusted by Cracked Traders
						</h3>
						<p className="mt-3 text-white/70 max-w-md">
							Join thousands of crypto investors who choose on-chain perpetual protocol to trader
							diverse assets.
						</p>
						<a
							href="/trending"
							className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-3 text-sm font-semibold bg-linear-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
						>
							Get Started
						</a>
					</div>
				</div>
				<div className="sm:hidden relative max-h-96 overflow-hidden">
					<motion.div
						className="flex gap-6"
						animate={{
							x: [0, -2000],
						}}
						transition={{
							x: {
								repeat: Infinity,
								repeatType: "loop",
								duration: 50,
								ease: "linear",
							},
						}}
					>
						{[...testimonials, ...testimonials].map((t, i) => (
							<div
								key={`mobile-${t.author.replace(/\s+/g, "-")}-${i}`}
								className="shrink-0 w-70 rounded-2xl bg-lime-800/20 p-6 border border-lime-400/60"
							>
								<p className="text-white/80 text-sm">"{t.quote}"</p>
								<div className="mt-4 flex items-center gap-3">
									{/* <Image
										src={t.avatar}
										alt={t.author}
										width={40}
										height={40}
										className="rounded-full"
									/> */}
									<div>
										<p className="text-white font-semibold text-sm">{t.author}</p>
										<p className="text-white/60 text-xs">{t.role}</p>
									</div>
								</div>
							</div>
						))}
					</motion.div>
					<div className="absolute inset-x-0 top-0 h-32 [background:linear-gradient(to_bottom,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] mix-blend-multiply opacity-90 pointer-events-none" />
					<div className="absolute inset-x-0 bottom-0 h-32 [background:linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0.7)_40%,#000_100%)] mix-blend-multiply opacity-90 pointer-events-none" />
				</div>

				<div className="hidden sm:block relative sm:max-h-150 md:max-h-screen overflow-hidden">
					<div className="grid sm:grid-cols-2 gap-6">
						<motion.div
							className="flex flex-col gap-6 sm:mt-10"
							animate={{
								y: [0, -800],
							}}
							transition={{
								y: {
									repeat: Infinity,
									repeatType: "loop",
									duration: 40,
									ease: "linear",
								},
							}}
						>
							{[...testimonials, ...testimonials]
								.filter((_, idx) => idx % 2 === 0)
								.map((t, i) => (
									<div
										key={`left-${t.author.replace(/\s+/g, "-")}-${i}`}
										className={`rounded-2xl bg-lime-800/20 p-6 border border-lime-400/60`}
									>
										<p className="text-white/80">“{t.quote}”</p>
										<div className="mt-4 flex items-center gap-3">
											{/* <Image
												src={t.avatar}
												alt={t.author}
												width={40}
												height={40}
												className="rounded-full"
											/> */}
											<div>
												<p className="text-white font-semibold text-sm">{t.author}</p>
												<p className="text-white/60 text-xs">{t.role}</p>
											</div>
										</div>
									</div>
								))}
						</motion.div>
						<motion.div
							className="flex flex-col gap-6"
							animate={{
								y: [-800, 0],
							}}
							transition={{
								y: {
									repeat: Infinity,
									repeatType: "loop",
									duration: 40,
									ease: "linear",
								},
							}}
						>
							{[...testimonials, ...testimonials]
								.filter((_, idx) => idx % 2 !== 0)
								.map((t, i) => (
									<div
										key={`right-${t.author.replace(/\s+/g, "-")}-${i}`}
										className={`rounded-2xl bg-lime-800/20 p-6 border border-lime-400/60`}
									>
										<p className="text-white/80">“{t.quote}”</p>
										<div className="mt-4 flex items-center gap-3">
											{/* <Image
												src={t.avatar}
												alt={t.author}
												width={40}
												height={40}
												className="rounded-full"
											/> */}
											<div>
												<p className="text-white font-semibold text-sm">{t.author}</p>
												<p className="text-white/60 text-xs">{t.role}</p>
											</div>
										</div>
									</div>
								))}
						</motion.div>
					</div>
					<div className="absolute inset-x-0 -top-32 h-64 [background:linear-gradient(to_bottom,#000_0%,rgba(0,0,0,0.7)_80%,rgba(0,0,0,0)_100%)] mix-blend-multiply opacity-90 pointer-events-none" />
					<div className="absolute inset-x-0 bottom-0 h-[40%] [background:linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0.7)_60%,#000_100%)] mix-blend-multiply opacity-90 pointer-events-none" />
				</div>
			</div>
		</section>
	);
};
