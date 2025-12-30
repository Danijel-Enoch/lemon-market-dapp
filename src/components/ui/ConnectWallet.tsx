import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import type { ComponentProps } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccountModal } from "@/components/ui/AccountModal";
import { cn } from "@/lib/utils";
import { CheckCircle } from "lucide-react";

export function ConnectWallet({
	text = "Connect Wallet",
	connectedNode,
	href,
	onClick,
	className,
	...props
}: {
	text?: React.ReactNode;
	connectedNode?: React.ReactNode;
	href?: string;
} & ComponentProps<"button">) {
	const navigate = useNavigate();
	const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
	// verification now handled globally in AppProvider; connect button only opens modals

	return (
		<ConnectButton.Custom>
			{({ account, chain, openChainModal, openConnectModal, mounted }) => {
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
										className={cn(
											"w-full inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm",
											"bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]",
										)}
										// {...props}
									>
										{text}
									</motion.button>
								);
							}

							if (connectedNode) {
								return (
									// @ts-expect-error motion button props
									<motion.button
										type="button"
										// onClick={openConnectModal}
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={cn(
											"w-full inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm",
											className || "bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]",
										)}
										onClick={(e) => {
											if (href) {
												e.preventDefault();
												navigate(href);
											}
											if (onClick) {
												onClick(e);
											}
										}}
										{...props}
									>
										{connectedNode}
									</motion.button>
								);
							}

							if (chain.unsupported) {
								return (
									<motion.button
										onClick={openChainModal}
										type="button"
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={cn(
											"w-full inline-flex items-center justify-center rounded-xl border border-red-500/60 gap-2.5 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm",
											"bg-linear-to-r from-red-600 via-red-700 to-red-900",
										)}
									>
										Wrong network
									</motion.button>
								);
							}
							return (
								<div className="flex gap-2">
									<motion.button
										onClick={openChainModal}
										type="button"
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={cn(
											"inline-flex items-center justify-center gap-2 px-2.5 md:px-4 py-2 md:py-3 text-white font-bold text-xs md:text-sm",
											// " rounded-xl border border-white/60 ",
											// props.className || "bg-linear-to-r from-lime-600/90 via-lime-700/90 to-lime-800/90",
										)}
										// {...props}
									>
										{chain.hasIcon && (
											<div
												style={{
													background: chain.iconBackground,
													width: 16,
													height: 16,
													borderRadius: 999,
													overflow: "hidden",
												}}
											>
												{chain.iconUrl && (
													<img
														alt={chain.name ?? "Chain icon"}
														src={chain.iconUrl}
														width={16}
														height={16}
													/>
												)}
											</div>
										)}
										<span className="hidden md:inline">{chain.name}</span>
									</motion.button>

									<motion.button
										onClick={() => setIsAccountModalOpen(true)}
										type="button"
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={cn(
											"inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-4 lg:px-6 py-2 lg:py-3 text-white font-bold text-xs md:text-sm",
											"bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]",
										)}
										// {...props}
									>
										<span className="hidden md:inline">{account.displayName}</span>
										<CheckCircle size={16} className="md:hidden text-white" />
									</motion.button>
								</div>
							);
						})()}
						<AccountModal
							open={isAccountModalOpen}
							onOpenChange={setIsAccountModalOpen}
							account={account}
							chain={chain}
							openConnectModal={openConnectModal}
						/>
					</div>
				);
			}}
		</ConnectButton.Custom>
	);
}
