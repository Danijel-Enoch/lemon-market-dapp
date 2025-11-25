"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, ChevronDown, Coins, TrendingUp, Trophy, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMiniApp } from "@/components/providers/MiniAppProvider";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { Badge } from "@/components/ui/badge";

const tradeSubItems = [
	{ href: "/perp", label: "Perpetuals" },
	{ href: "/positions", label: "My Positions" },
];

const earnSubItems = [
	{ href: "/dashboard", label: "Dashboard" },
	{ href: "/leaderboard", label: "Leaderboard" },
	{ href: "/staking", label: "Staking" },
];

const navItems = [
	{ label: "Trade", icon: TrendingUp, subItems: tradeSubItems },
	{ label: "Earn", icon: Trophy, subItems: earnSubItems },
	{ href: "/positions", label: "Portfolio", icon: Wallet },
	{ href: "/trending", label: "Spot", icon: BarChart3 },
	{ href: "/staking", label: "Stake", icon: Coins },
];

export function Header() {
	const pathname = usePathname();
	const { isMiniApp, context } = useMiniApp();
	const [openDropdown, setOpenDropdown] = useState<string | null>(null);

	// Apply safe area insets if in Mini App
	const safeAreaStyle =
		isMiniApp && context?.client.safeAreaInsets
			? {
					paddingTop: context.client.safeAreaInsets.top,
				}
			: {};

	return (
		<>
			<div className="fixed top-0 left-0 right-0 w-full md:p-8 z-50" style={safeAreaStyle}>
				<motion.header
					initial={{ opacity: 0.5 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.6 }}
					className="max-w-7xl sm:mx-auto flex items-center justify-between sm:rounded-xl backdrop-blur-md px-4 md:px-6 py-4 bg-[#13151b99] border border-gray-100/10"
				>
					<Link href="/" className="inline-flex items-center gap-2 md:gap-3.5">
						<Image
							src="/image/logo.png"
							alt="Lemon Markets"
							width={39}
							height={40}
							style={{ width: "auto", height: "auto" }}
						/>
						<span className="hidden sm:inline-flex items-center bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent font-semibold text-xl">
							Lemon Markets
							<Badge
								variant="secondary"
								className="ml-2 text-[10px] border-lime-500 bg-transparent text-white"
							>
								BETA
							</Badge>
						</span>
					</Link>{" "}
					<nav className="hidden md:inline-flex items-center gap-9">
						{navItems.map((item) => {
							if (item.subItems) {
								const isActive = item.subItems.some((subItem) => pathname === subItem.href);
								const isOpen = openDropdown === item.label;

								return (
									<div
										key={item.label}
										className="relative"
										onMouseEnter={() => setOpenDropdown(item.label)}
										onMouseLeave={() => setOpenDropdown(null)}
									>
										<button
											type="button"
											className={`inline-flex items-center gap-1 transition-all text-sm leading-tight ${
												isActive
													? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
													: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
											}`}
										>
											{item.label}
											<ChevronDown
												size={14}
												className={`transition-transform ${isOpen ? "rotate-180" : ""} ${isActive ? "text-lime-400" : "text-gray-300"}`}
											/>
										</button>{" "}
										<AnimatePresence>
											{isOpen && (
												<motion.div
													initial={{ opacity: 0, y: -10 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: -10 }}
													transition={{ duration: 0.2 }}
													className="absolute top-full left-0 mt-2 py-1 min-w-30 bg-[#13151b99] border border-gray-100/10 rounded-lg backdrop-blur-md shadow-xl"
												>
													{item.subItems.map((subItem) => {
														const isSubActive = pathname === subItem.href;
														return (
															<Link
																key={subItem.href}
																href={subItem.href}
																className={`block px-3 py-1.5 text-sm transition-all ${
																	isSubActive
																		? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
																		: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
																}`}
																shallow
															>
																{subItem.label}
															</Link>
														);
													})}
												</motion.div>
											)}
										</AnimatePresence>
									</div>
								);
							}

							if (!item.href) return null;

							const isActive = pathname === item.href;
							return (
								<Link
									key={item.href}
									href={item.href}
									className={`transition-all text-sm leading-tight ${
										isActive
											? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
											: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
									}`}
									shallow
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
					<ConnectWallet text="Connect Wallet" />
				</motion.header>
			</div>

			{isMiniApp && (
				<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#13151b] border-t border-gray-100/10 backdrop-blur-md z-50">
					<div className="flex items-center justify-around px-2 py-3">
						{navItems.map((item) => {
							if (item.subItems) {
								const isActive = item.subItems.some((subItem) => pathname === subItem.href);
								const Icon = item.icon;
								const isOpen = openDropdown === item.label;

								return (
									<div key={item.label} className="relative">
										<button
											type="button"
											onClick={() => setOpenDropdown(isOpen ? null : item.label)}
											className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-20 relative ${
												isActive
													? "bg-linear-to-r from-lime-300/10 via-green-600/10 to-green-950/10"
													: ""
											}`}
										>
											<Icon
												size={20}
												className={`transition-all ${isActive ? "text-lime-400" : "text-gray-400"}`}
											/>
											<div className="flex items-center gap-0.5">
												<span
													className={`text-xs font-medium transition-all ${
														isActive
															? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent"
															: "text-gray-400"
													}`}
												>
													{item.label}
												</span>
												<ChevronDown
													size={10}
													className={`transition-transform ${isOpen ? "rotate-180" : ""} ${isActive ? "text-lime-400" : "text-gray-400"}`}
												/>
											</div>
										</button>{" "}
										<AnimatePresence>
											{isOpen && (
												<motion.div
													initial={{ opacity: 0, y: 10 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: 10 }}
													transition={{ duration: 0.2 }}
													className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 py-1 min-w-40 bg-[#13151b99] border border-gray-100/10 rounded-lg backdrop-blur-md shadow-xl"
												>
													{item.subItems.map((subItem) => {
														const isSubActive = pathname === subItem.href;
														return (
															<Link
																key={subItem.href}
																href={subItem.href}
																onClick={() => setOpenDropdown(null)}
																className={`block px-3 py-1.5 text-sm transition-all ${
																	isSubActive
																		? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
																		: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
																}`}
																shallow
															>
																{subItem.label}
															</Link>
														);
													})}
												</motion.div>
											)}
										</AnimatePresence>
									</div>
								);
							}

							if (!item.href) return null;

							const isActive = pathname === item.href;
							const Icon = item.icon;
							return (
								<Link
									key={item.href}
									href={item.href}
									className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-20 ${
										isActive
											? "bg-linear-to-r from-lime-300/10 via-green-600/10 to-green-950/10"
											: ""
									}`}
									shallow
								>
									<Icon
										size={20}
										className={`transition-all ${isActive ? "text-lime-400" : "text-gray-400"}`}
									/>
									<span
										className={`text-xs font-medium transition-all ${
											isActive
												? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent"
												: "text-gray-400"
										}`}
									>
										{item.label}
									</span>
								</Link>
							);
						})}
					</div>
				</nav>
			)}
		</>
	);
}
