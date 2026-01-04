import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const BANNER_HEIGHT = 48; // Approximate height in pixels

export const FaucetBanner = () => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		// Check if user has dismissed the banner before
		const isDismissed = localStorage.getItem("faucetBannerDismissed");
		if (!isDismissed) {
			setIsVisible(true);
		}
	}, []);

	const handleClose = () => {
		setIsVisible(false);
		localStorage.setItem("faucetBannerDismissed", "true");
	};

	return (
		<>
			<AnimatePresence>
				{isVisible && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: BANNER_HEIGHT, opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3, ease: "easeOut" }}
						className="fixed top-0 left-0 right-0 z-60 overflow-hidden"
					>
						<div className="h-full relative border-b border-lime-400/20 shadow-[0_4px_20px_rgba(163,230,53,0.15)] overflow-hidden font-raleway">
							{/* Premium Citrus Background Layers - Strictly Lime/Lemon */}
							<div className="absolute inset-0 bg-linear-to-r from-[#1a2e05] via-lime-500 to-[#d9f99d] animate-gradient-shift opacity-85" />
							<div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(163,230,53,0.3)_0%,transparent_60%),radial-gradient(circle_at_80%_50%,rgba(190,242,100,0.2)_0%,transparent_60%)] mix-blend-overlay" />
							<div className="absolute inset-0 bg-black/50 backdrop-blur-xl" />

							{/* Inner Glow Border */}
							<div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-lime-400/50 to-transparent" />

							{/* Shimmer / Zesty Pattern */}
							<div
								className="absolute inset-0 opacity-10 pointer-events-none"
								style={{
									backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
									backgroundSize: "24px 24px",
								}}
							/>
							<div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent animate-gradient-shift opacity-30" />

							<div className="container mx-auto px-4 py-3 h-full relative z-10">
								<div className="flex items-center justify-between gap-4 h-full">
									<div className="flex-1 flex items-center justify-center gap-3 text-center">
										<motion.div
											animate={{ scale: [1, 1.1, 1] }}
											transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
											className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-lime-400/20 border border-lime-400/30 backdrop-blur-sm shrink-0 shadow-[0_0_10px_rgba(163,230,53,0.3)]"
										>
											<span className="text-xl">🍋</span>
										</motion.div>
										<p className="text-sm sm:text-base text-white/95 font-semibold tracking-tight">
											Claim your free testnet tokens!{" "}
											<motion.a
												href="https://t.me/lemonMarketsBot"
												target="_blank"
												rel="noopener noreferrer"
												whileHover={{ scale: 1.05, filter: "brightness(1.1)" }}
												whileTap={{ scale: 0.95 }}
												className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lime-400 text-black hover:bg-lime-300 transition-all shadow-[0_4px_12px_rgba(163,230,53,0.35)] hover:shadow-[0_4px_16px_rgba(163,230,53,0.5)] group/link ml-2 no-underline"
											>
												<span className="text-xs uppercase font-extrabold tracking-widest">
													Get Tokens
												</span>
												<svg
													className="w-4 h-4 inline"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<title>External Link</title>
													<path
														className="group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
													/>
												</svg>
											</motion.a>
											<span className="hidden md:inline ml-1 text-white/80 font-medium">
												and start trading today!
											</span>
										</p>
									</div>
									<button
										type="button"
										onClick={handleClose}
										className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors group"
										aria-label="Close banner"
									>
										<X className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
									</button>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
			{/* Spacer to prevent content from being hidden behind the fixed banner */}
			{isVisible && (
				<motion.div
					initial={{ height: 0 }}
					animate={{ height: BANNER_HEIGHT }}
					exit={{ height: 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
					className="w-full"
				/>
			)}
		</>
	);
};
