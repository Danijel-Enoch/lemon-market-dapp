"use client";

import Image from "next/image";
import type { FC } from "react";
import { motion } from "framer-motion";

const testimonials = [
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-1.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-3.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-3.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
		avatar: "/assets/homepage/testimonial-2.png",
	},
	{
		quote:
			"Lorem ipsum dolor sit amet consectetur. Cursus diam malesuada molestie egestas. Viverra sit viverra ipsum eget imperdiet.",
		author: "John Doe",
		role: "Crypto Blogger",
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
							className="opacity-90"
						/>
						<span className="text-[#9DEA29] font-medium text-sm leading-[19px]">Testimonials</span>
						<Image
							src="/assets/homepage/section-features-divider.png"
							alt="Divider"
							width={72}
							height={10}
							className="opacity-90 rotate-180"
						/>
					</div>
					<div className="mt-6">
						<h3 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
							Trusted by Crypto Natives Worldwide
						</h3>
						<p className="mt-3 text-white/70 max-w-md">
							Thousands of crypto investors rely on Lemon Markets to leverage their assets with
							confidence and clarity.
						</p>
						<a
							href="/trending"
							className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-3 text-sm font-semibold bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 text-gray-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
						>
							Get Started
						</a>
					</div>
				</div>
				<div className="relative sm:max-h-[600px] md:max-h-[640px] overflow-hidden">
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
							{/* Duplicate items for seamless loop */}
							{[...testimonials, ...testimonials]
								.filter((_, idx) => idx % 2 === 0)
								.map((t, i) => (
									<div
										key={`left-${i}`}
										className={`rounded-2xl bg-lime-800/20 p-6 border border-lime-400/60`}
									>
										<p className="text-white/80">“{t.quote}”</p>
										<div className="mt-4 flex items-center gap-3">
											<Image
												src={t.avatar}
												alt={t.author}
												width={40}
												height={40}
												className="rounded-full"
											/>
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
							{/* Duplicate items for seamless loop */}
							{[...testimonials, ...testimonials]
								.filter((_, idx) => idx % 2 !== 0)
								.map((t, i) => (
									<div
										key={`right-${i}`}
										className={`rounded-2xl bg-lime-800/20 p-6 border border-lime-400/60`}
									>
										<p className="text-white/80">“{t.quote}”</p>
										<div className="mt-4 flex items-center gap-3">
											<Image
												src={t.avatar}
												alt={t.author}
												width={40}
												height={40}
												className="rounded-full"
											/>
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
