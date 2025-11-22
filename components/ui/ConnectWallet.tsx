"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useRef } from "react";
import toast from "react-hot-toast";
import { useAsync } from "react-use";
import { useAccount } from "wagmi";
import { verifyTask } from "@/lib/kickoff-service";
import { cn } from "@/lib/utils";

export function ConnectWallet({
	text = "Connect Wallet",
	connectedNode,
	href,
	onClick,
	...props
}: {
	text?: string;
	connectedNode?: React.ReactNode;
	href?: string;
} & ComponentProps<"button">) {
	const router = useRouter();
	const { address, isConnected } = useAccount();
	const lastVerifiedRef = useRef<string | null>(null);

	useAsync(async () => {
		if (!isConnected || !address) return;
		if (lastVerifiedRef.current === address) return;
		lastVerifiedRef.current = address;
		toast.loading("Verifying wallet connection...");
		const { message } = await verifyTask(address, "connect_wallet");
		toast.success(message || "Wallet connected and task verified!");
	}, [isConnected, address]);

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
											props.className || "bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]",
										)}
										onClick={(e) => {
											if (href) {
												e.preventDefault();
												router.push(href);
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
													<Image
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
										onClick={openAccountModal}
										type="button"
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className={cn(
											"inline-flex items-center justify-center rounded-xl border border-white/60 gap-2.5 px-4 md:px-6 py-2 md:py-3 text-white font-bold text-xs md:text-sm",
											"bg-linear-to-r from-lime-600 via-lime-700 to-[#004530]",
										)}
										// {...props}
									>
										{account.displayName}
									</motion.button>
								</div>
							);
						})()}
					</div>
				);
			}}
		</ConnectButton.Custom>
	);
}
