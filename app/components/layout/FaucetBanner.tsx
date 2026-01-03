import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
						className="fixed top-0 left-0 right-0 z-[60] overflow-hidden"
					>
						<div className="h-full relative border-b border-white/10 shadow-lg backdrop-blur-sm overflow-hidden">
							{/* Animated gradient background */}
							<div className="absolute inset-0 bg-gradient-to-r from-lime-500 via-yellow-500 to-orange-500 animate-gradient-shift" />
							<div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 animate-gradient-shift-reverse opacity-60" />
							<div className="absolute inset-0 bg-[#004530]/40 backdrop-blur-sm" />
							{/* Shimmer effect */}
							<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-gradient-shift opacity-30" />
							
							<div className="container mx-auto px-4 py-3 h-full relative z-10">
								<div className="flex items-center justify-between gap-4 h-full">
									<div className="flex-1 flex items-center justify-center gap-3 text-center">
										<div className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex-shrink-0">
											<span className="text-xl">🍋</span>
										</div>
										<p className="text-sm sm:text-base text-white font-medium">
											<span className="hidden sm:inline">🎁 </span>
											Claim your free testnet tokens!{" "}
											<a
												href="https://t.me/lemonMarketsBot"
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 font-bold text-white hover:text-yellow-300 transition-colors underline decoration-dotted underline-offset-4"
											>
												Click here to access the faucet bot
												<svg
													className="w-4 h-4 inline"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<title>External Link</title>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
													/>
												</svg>
											</a>
											<span className="hidden sm:inline"> and start trading today!</span>
										</p>
									</div>
									<button
										type="button"
										onClick={handleClose}
										className="flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors group"
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

