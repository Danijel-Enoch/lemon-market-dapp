"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";

export function ConnectWallet({ text = "Connect Wallet" }) {
	return (
		<ConnectButton.Custom>
			{({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
				const ready = mounted;
				const connected = ready && account && chain;

				return (
					<div
						{...(!ready && {
							"aria-hidden": true,
							style: {
								opacity: 0,
								pointerEvents: "none",
								userSelect: "none",
							},
						})}
					>
						{(() => {
							if (!connected) {
								return (
									<motion.button
										type="button"
										onClick={openConnectModal}
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className="w-full hidden md:inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-8 py-4 bg-gradient-to-r from-lime-600 via-lime-700 to-[#004530] text-white font-bold text-sm"
									>
										{text}
									</motion.button>
								);
							}

							if (chain.unsupported) {
								return (
									<button
										onClick={openChainModal}
										type="button"
										className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-red-600 text-white hover:bg-red-700 h-10 px-4 py-2"
									>
										Wrong network
									</button>
								);
							}

							return (
								<div className="flex gap-2">
									<button
										onClick={openChainModal}
										type="button"
										className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-slate-800 text-white hover:bg-slate-700 h-10 px-3 py-2"
									>
										{chain.hasIcon && (
											<div
												style={{
													background: chain.iconBackground,
													width: 12,
													height: 12,
													borderRadius: 999,
													overflow: "hidden",
													marginRight: 4,
												}}
											>
												{chain.iconUrl && (
													<img
														alt={chain.name ?? "Chain icon"}
														src={chain.iconUrl}
														style={{
															width: 12,
															height: 12,
														}}
													/>
												)}
											</div>
										)}
										{chain.name}
									</button>

									<button
										onClick={openAccountModal}
										type="button"
										className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-teal-600 text-white hover:bg-teal-700 h-10 px-4 py-2"
									>
										{account.displayName}
									</button>
								</div>
							);
						})()}
					</div>
				);
			}}
		</ConnectButton.Custom>
	);
}
