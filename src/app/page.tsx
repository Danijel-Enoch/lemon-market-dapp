"use client";

import { motion } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useMiniApp } from "@/components/providers/MiniAppProvider";

export default function Home() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [openFaq, setOpenFaq] = useState<number | null>(null);
	const { isMiniApp, context } = useMiniApp();

	const fadeInUp = {
		initial: { opacity: 0, y: 60 },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.6 }
	};

	const staggerContainer = {
		animate: {
			transition: {
				staggerChildren: 0.1
			}
		}
	};

	useEffect(() => {
		if (isMiniApp) {
			console.log("Running as Farcaster Mini App", context);
		} else {
			console.log("Running as regular website");
		}
	}, [isMiniApp, context]);

	const faqItems = [
		{
			question:
				"How does Lemon Perp use lemon markets in digital asset management?",
			answer: "Lemon Perp leverages advanced market mechanisms to provide efficient trading solutions for digital assets."
		},
		{
			question: "Which cryptocurrencies does Lemon Perp support?",
			answer: "We support major cryptocurrencies including Bitcoin, Ethereum, and various ERC-20 tokens."
		},
		{
			question: "How do I get started with Lemon Perp?",
			answer: "Simply connect your Web3 wallet, select a trading pair, and start trading with our intuitive interface."
		},
		{
			question: "Can I recover my wallet if I lose my device?",
			answer: "Yes, you can recover your wallet using your seed phrase or backup methods provided by your wallet provider."
		},
		{
			question: "Is Lemon Perp available globally?",
			answer: "Lemon Perp is available in most countries, subject to local regulations and compliance requirements."
		},
		{
			question: "Does Lemon Perp offer customer support?",
			answer: "Yes, we provide 24/7 customer support through various channels including chat and email."
		}
	];

	return (
		<div className="bg-black text-white overflow-x-hidden">
			<div className="w-full min-h-screen flex flex-col items-center px-4 md:px-32">
				<div className="relative flex flex-col items-center justify-center w-full mb-20">
					<Image
						src="/image/hero-background.svg"
						alt="Background"
						width={763}
						height={763}
						priority
					/>

					<div className="absolute flex flex-col items-center gap-y-5 px-4">
						<div className="flex flex-col items-center gap-y-4">
							<motion.h1
								initial={{ opacity: 0, y: 30 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.8, delay: 0.2 }}
								className="text-center text-white text-5xl md:text-7xl leading-normal font-bold"
							>
								Unlimited{" "}
								<span className="text-primary">Markets</span>.
								<br />
								Unlimited Opportunities.
							</motion.h1>

							<motion.p
								initial={{ opacity: 0, y: 30 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.8, delay: 0.4 }}
								className="text-center bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent text-lg md:text-xl font-medium leading-loose max-w-xl"
							>
								Trade asset class with up to 100x leverage
							</motion.p>
						</div>

						<motion.a
							href="/trending"
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.8, delay: 0.6 }}
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							className="inline-flex items-center justify-center rounded-xl border border-white/50 gap-x-2.5 px-10 py-4 bg-gradient-to-r from-lime-600 via-lime-700 to-green-950 font-bold text-gray-100"
						>
							Launch App
						</motion.a>
					</div>
				</div>
			</div>

			<motion.section
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				variants={staggerContainer}
				className="py-16 px-8 max-w-7xl mx-auto flex items-center  gap-20 bg-gradient-to-br from-green-800 via-green-800/60 to-[#004530] rounded-[80px] p-8 backdrop-blur-sm border border-white/10"
			>
				<motion.div
					variants={fadeInUp}
					className="flex items-center gap-6"
				>
					<Image
						src="/image/wallet-icon.svg"
						alt="Wallet Icon"
						width={64}
						height={64}
					/>
					<div>
						<h3 className="text-2xl font-bold mb-4">
							Connect wallet
						</h3>
						<p className="text-white/70 leading-relaxed">
							Securely link your Web3 wallet, such as MetaMask, to
							access the Lemon Markets protocol
						</p>
					</div>
				</motion.div>

				<motion.div
					variants={fadeInUp}
					className="flex items-center gap-6"
				>
					<Image
						src="/image/leaf-icon.svg"
						alt="Wallet Icon"
						width={64}
						height={64}
					/>
					<div>
						<h3 className="text-2xl font-bold mb-4">
							Select a pair
						</h3>
						<p className="text-white/70 leading-relaxed">
							Predict markets on any asset, from ETH to S&P 500
							tokens.
						</p>
					</div>
				</motion.div>

				<motion.div
					variants={fadeInUp}
					className="flex items-center gap-6"
				>
					<Image
						src="/image/trading-icon.svg"
						alt="Wallet Icon"
						width={64}
						height={64}
					/>
					<div>
						<h3 className="text-2xl font-bold mb-4">
							Start Trading
						</h3>
						<p className="text-white/70 leading-relaxed">
							Go long or short. If your call is right, you earn
							instantly, no middlemen, no delays.
						</p>
					</div>
				</motion.div>
			</motion.section>

			<motion.section
				id="features"
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 max-w-7xl mx-auto"
			>
				<div className="text-center mb-16">
					<motion.div
						variants={fadeInUp}
						className="inline-block bg-neutral-900/60 rounded-full px-6 py-3 mb-6"
					>
						<span className="text-green-600/60 font-bold text-sm tracking-wider">
							FEATURES
						</span>
					</motion.div>
					<motion.h2
						variants={fadeInUp}
						className="text-5xl md:text-6xl font-semibold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
					>
						Built for Infinite Markets
					</motion.h2>
					<motion.p
						variants={fadeInUp}
						className="text-xl text-white/70 max-w-2xl mx-auto leading-relaxed"
					>
						Trade with confidence through the most efficient
						on-chain perpetual protocol.
					</motion.p>
				</div>

				<div className="grid lg:grid-cols-2 gap-16 items-center">
					<motion.div variants={fadeInUp}>
						<Image
							src="/image/features-image.png"
							alt="Features"
							width={530}
							height={529}
							className="rounded-lg"
						/>
					</motion.div>

					<motion.div variants={fadeInUp} className="space-y-12">
						<div>
							<h3 className="text-2xl font-semibold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								Unified Liquidity Model
							</h3>
							<p className="text-white/70 leading-relaxed">
								All trades settle against a shared collateral
								reserve, unlocking deeper liquidity and capital
								efficiency across every asset.
							</p>
						</div>
						<div className="h-px bg-white/20"></div>
						<div>
							<h3 className="text-2xl font-semibold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								Synthetic Asset Support
							</h3>
							<p className="text-white/70 leading-relaxed">
								Access perpetual markets for crypto, forex, and
								commodities without depending on fragmented DEX
								liquidity.
							</p>
						</div>
						<div className="h-px bg-white/20"></div>
						<div>
							<h3 className="text-2xl font-semibold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								Oracle-Powered Precision
							</h3>
							<p className="text-white/70 leading-relaxed">
								Reliable, cryptographically verified price data
								keeps every trade fair and secured.
							</p>
						</div>
					</motion.div>
				</div>
			</motion.section>

			<motion.section
				id="about"
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 max-w-7xl mx-auto relative"
			>
				<div className="absolute top-0 left-8 w-96 h-2 bg-gradient-to-r from-lime-300 via-green-600 to-green-950 rounded-full blur-lg opacity-60"></div>

				<div className="grid lg:grid-cols-2 gap-16 items-center">
					<motion.div variants={fadeInUp}>
						<motion.div
							variants={fadeInUp}
							className="inline-block bg-neutral-900/60 rounded-full px-6 py-3 mb-6"
						>
							<span className="text-green-600/60 font-bold text-sm tracking-wider">
								ABOUT
							</span>
						</motion.div>
						<h2 className="text-5xl md:text-6xl font-semibold mb-8 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
							Reimagining Perpetual Trading
						</h2>
						<p className="text-white/70 leading-relaxed text-lg mb-8">
							Lemon Markets is building the future of synthetic
							trading , one where liquidity, leverage, and
							accessibility converge into a single decentralized
							ecosystem. No market silos. No barriers to entry.
							Just a faster, fairer, and freer way to trade global
							assets.
						</p>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 text-white px-12 py-4 rounded-lg font-bold border border-white/20"
						>
							Get Started
						</motion.button>
					</motion.div>

					<motion.div variants={fadeInUp} className="relative">
						<div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-full p-20">
							<Image
								src="/image/about-lemon.png"
								alt="About"
								width={87}
								height={120}
								className="mx-auto"
							/>
						</div>
					</motion.div>
				</div>

				<div className="absolute bottom-0 right-8 w-96 h-2 bg-gradient-to-r from-lime-300 via-green-600 to-green-950 rounded-full blur-lg opacity-60 rotate-2"></div>
			</motion.section>

			<motion.section
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 max-w-4xl mx-auto text-center"
			>
				<motion.h2
					variants={fadeInUp}
					className="text-3xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
				>
					Watch How Lemon Markets Works
				</motion.h2>
				<motion.p
					variants={fadeInUp}
					className="text-white/70 text-lg mb-12 max-w-2xl mx-auto"
				>
					A simple platform for traders who want clarity, speed, and
					control.
				</motion.p>
				<motion.div
					variants={fadeInUp}
					className="aspect-video rounded-lg flex items-center justify-center"
				>
					<Image
						src="/image/video-placeholder.svg"
						alt="Video Placeholder"
						width={800}
						height={300}
						className="opacity-50"
					/>
				</motion.div>
			</motion.section>

			<motion.section
				id="roadmap"
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 max-w-6xl mx-auto"
			>
				<div className="text-center mb-16">
					<motion.div
						variants={fadeInUp}
						className="inline-block bg-neutral-900 rounded-full px-6 py-3 mb-6"
					>
						<span className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-bold text-sm tracking-wider">
							GOALS
						</span>
					</motion.div>
					<motion.h2
						variants={fadeInUp}
						className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
					>
						Roadmap
					</motion.h2>
				</div>

				<div className="relative">
					<div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-lime-300 to-green-950"></div>

					<div className="space-y-16">
						{[
							{
								phase: "Phase I",
								content:
									"Finalize multi-chain support (Ethereum, Bitcoin, EVM chains).\n\nPartner with oracles (e.g., Chainlink) for secure data feeds.\n\nComplete third-party security audits."
							},
							{
								phase: "Phase II",
								content:
									"Invite 1,000+ users to test AI-driven insights and cross-chain swaps.\n\nOptimize UI/UX and resolve edge-case vulnerabilities."
							},
							{
								phase: "Phase III",
								content:
									"Release web and mobile platforms with core features (AI dashboards, self-custody).\n\nLaunch global marketing and partner with liquidity providers."
							},
							{
								phase: "Phase IV",
								content:
									"Integrate DeFi protocols (Uniswap, Aave) and Layer-2 networks.\n\nAdd staking, governance, and institutional tools."
							}
						].map((item, index) => (
							<motion.div
								key={index}
								variants={fadeInUp}
								className="relative flex items-start space-x-8"
							>
								<div className="w-4 h-4 bg-gradient-to-r from-lime-300 to-green-950 rounded-full relative z-10"></div>
								<div className="flex-1">
									<h3 className="text-2xl font-bold mb-4 text-white">
										{item.phase}
									</h3>
									<p className="text-white/70 leading-relaxed whitespace-pre-line">
										{item.content}
									</p>
								</div>
							</motion.div>
						))}
					</div>
				</div>
			</motion.section>

			<motion.section
				id="faq"
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 max-w-4xl mx-auto"
			>
				<div className="text-center mb-16">
					<motion.div
						variants={fadeInUp}
						className="inline-block bg-neutral-900 rounded-full px-6 py-3 mb-6"
					>
						<span className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-bold text-sm tracking-wider">
							FAQ
						</span>
					</motion.div>
					<motion.h2
						variants={fadeInUp}
						className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
					>
						Frequently Asked Questions
					</motion.h2>
					<motion.p
						variants={fadeInUp}
						className="text-white/70 text-lg"
					>
						How Can we Smoothen your journey?
					</motion.p>
				</div>

				<motion.div variants={staggerContainer} className="space-y-4">
					{faqItems.map((item, index) => (
						<motion.div
							key={index}
							variants={fadeInUp}
							className="border-b border-white/20"
						>
							<button
								onClick={() =>
									setOpenFaq(openFaq === index ? null : index)
								}
								className="w-full flex items-center justify-between py-6 text-left"
							>
								<span className="text-lg font-medium text-white pr-4">
									{item.question}
								</span>
								<ChevronDown
									className={`w-5 h-5 text-white/60 transition-transform ${
										openFaq === index ? "rotate-180" : ""
									}`}
								/>
							</button>
							{openFaq === index && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="pb-6"
								>
									<p className="text-white/70 leading-relaxed">
										{item.answer}
									</p>
								</motion.div>
							)}
						</motion.div>
					))}
				</motion.div>
			</motion.section>

			<motion.section
				initial="initial"
				whileInView="animate"
				viewport={{ once: true }}
				className="py-20 px-4 text-center"
			>
				<motion.h2
					variants={fadeInUp}
					className="text-5xl md:text-6xl font-bold mb-8"
				>
					<span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
						The future of Trading
					</span>
					<br />
					<span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
						starts here
					</span>
				</motion.h2>
				<motion.button
					variants={fadeInUp}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 text-white px-12 py-4 rounded-lg text-lg font-bold border border-white/20"
				>
					Start Free Trial
				</motion.button>
			</motion.section>

			<footer className="border-t border-white/20 py-12 px-4">
				<div className="max-w-7xl mx-auto">
					<div className="grid md:grid-cols-3 gap-8 mb-8">
						<div className="md:col-span-2">
							<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
								<div className="flex items-center space-x-3 mb-4 md:mb-0">
									<Image
										src="/image/logo-footer.png"
										alt="Lemon Perp Logo"
										width={40}
										height={40}
										className="rounded"
									/>
									<span className="text-xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
										Lemon Perp
									</span>
								</div>
								<nav className="flex flex-wrap gap-6">
									<a
										href="#home"
										className="text-white/60 hover:text-white transition-colors"
									>
										Home
									</a>
									<a
										href="#features"
										className="text-white/60 hover:text-white transition-colors"
									>
										Features
									</a>
									<a
										href="#about"
										className="text-white/60 hover:text-white transition-colors"
									>
										About
									</a>
									<a
										href="#roadmap"
										className="text-white/60 hover:text-white transition-colors"
									>
										Roadmap
									</a>
									<a
										href="#faq"
										className="text-white/60 hover:text-white transition-colors"
									>
										FAQ
									</a>
								</nav>
								<div className="flex items-center space-x-4 mt-4 md:mt-0">
									<Image
										src="/image/twitter.svg"
										alt="Twitter"
										width={24}
										height={24}
									/>
									<Image
										src="/image/telegram.svg"
										alt="Telegram"
										width={24}
										height={24}
									/>
									<Image
										src="/image/discord.svg"
										alt="Discord"
										width={24}
										height={24}
									/>
								</div>
							</div>
						</div>

						<div className="bg-neutral-900 rounded-lg p-6">
							<div className="flex items-center space-x-3 mb-4">
								<Image
									src="/image/logo-newsletter.png"
									alt="Logo"
									width={32}
									height={32}
								/>
								<h3 className="text-lg font-semibold">
									Join our Waitlist
								</h3>
							</div>
							<div className="flex">
								<input
									type="email"
									placeholder="Enter your email address"
									className="flex-1 bg-gray-800 border border-gray-700 rounded-l-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
								/>
								<button className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 text-white px-6 py-2 rounded-r-lg font-semibold">
									Subscribe
								</button>
							</div>
						</div>
					</div>

					<div className="flex flex-col md:flex-row md:items-center md:justify-between pt-8 border-t border-white/20 text-white/60">
						<p>Copyright © 2025 Lemon Perp. All rights reserved.</p>
						<div className="flex space-x-6 mt-4 md:mt-0">
							<a
								href="#"
								className="hover:text-white transition-colors"
							>
								Privacy Policy
							</a>
							<a
								href="#"
								className="hover:text-white transition-colors"
							>
								Terms and Conditions
							</a>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
