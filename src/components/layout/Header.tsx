import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, ChevronDown, Coins, Flame, Gift, Medal, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMiniApp } from "@/components/providers/MiniAppProvider";
import { Badge } from "@/components/ui/badge";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

const earnSubItems = [
	{ href: "/points", label: "Points" },
	{ href: "/liquidity", label: "Liquidity" },
	{ href: "/referral", label: "Referral" },
];

const navItems = [
	{ href: "/trending", label: "Trending", icon: Flame },
	{ label: "Earn", icon: Gift, subItems: earnSubItems },
	{ href: "/portfolio", label: "Portfolio", icon: Briefcase },
	// { href: "/spot", label: "Spot", icon: BarChart3 },
	{ href: "/staking", label: "Stake", icon: Coins },
	{ href: "/leaderboard", label: "Leaderboard", icon: Medal },
];

export function Header() {
	const location = useLocation();
	const pathname = location.pathname;
	const { isMiniApp, context } = useMiniApp();
	const [openDropdown, setOpenDropdown] = useState<string | null>(null);

	// Apply safe area insets if in Mini App
	const safeAreaStyle =
		isMiniApp && context?.client.safeAreaInsets
			? {
					paddingTop: context.client.safeAreaInsets.top,
				}
			: {};

	const otherPages = pathname.length > 2;

	return (
		<>
			<div className="fixed w-full md:p-4 lg:p-8 z-50" style={safeAreaStyle}>
				<div className={otherPages ? "sm:mx-auto" : "max-w-7xl sm:mx-auto"}>
					<motion.header
						initial={{ opacity: 0.5 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6 }}
						className="px-4 lg:px-6 sm:mx-auto flex items-center justify-between sm:rounded-xl backdrop-blur-md py-4 bg-[#13151b99] border border-gray-100/10"
					>
						<Link to="/" className="inline-flex items-center gap-2 md:gap-3.5">
							<img
								src="/image/logo.png"
								alt="Lemon Markets"
								width={38}
								height={40}
								// className="animate-spin"
							/>
							<span className="inline-flex md:items-start xl:items-center bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent font-semibold text-xl md:text-lg lg:text-xl">
								Lemon Markets
								<Badge
									variant="secondary"
									className="ml-2 text-[10px] border-lime-500 bg-transparent text-white"
								>
									BETA
								</Badge>
							</span>
						</Link>{" "}
						<nav className="hidden md:inline-flex items-center gap-9 md:gap-6 xl:gap-9">
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
													className={`transition-transform ${isOpen ? "rotate-180" : ""} ${
														isActive ? "text-lime-400" : "text-gray-300"
													}`}
												/>
											</button>{" "}
											<AnimatePresence>
												{isOpen && (
													<motion.div
														initial={{
															opacity: 0,
															y: -10,
														}}
														animate={{
															opacity: 1,
															y: 0,
														}}
														exit={{
															opacity: 0,
															y: -10,
														}}
														transition={{
															duration: 0.2,
														}}
														className="absolute top-full left-0 mt-2 py-1 min-w-30 bg-[#13151b99] border border-gray-100/10 rounded-lg backdrop-blur-md shadow-xl"
													>
														{item.subItems.map((subItem) => {
															const isSubActive = pathname === subItem.href;
															return (
																<Link
																	key={subItem.href}
																	to={subItem.href}
																	className={`block px-3 py-1.5 text-sm transition-all ${
																		isSubActive
																			? "bg-linear-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
																			: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
																	}`}
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
										to={item.href}
										className={`transition-all text-sm leading-tight ${
											isActive
												? "bg-linear-to-r from-lime-600 via-green-600 to-green-500 bg-clip-text text-transparent font-semibold"
												: "bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
										}`}
									>
										{item.label}
									</Link>
								);
							})}
						</nav>
						<ConnectWallet
							text={
								<>
									<span className="hidden md:inline">Connect Wallet</span>
									<span className="md:hidden">
										<Wallet size={16} />
									</span>
								</>
							}
						/>
					</motion.header>
				</div>
			</div>

			{otherPages && (
				<nav className="md:hidden fixed bottom-0 left-0 right-0 p-3 z-50">
					<div className="mx-auto max-w-md bg-[#13151b]/95 border border-gray-800/50 rounded-2xl backdrop-blur-xl shadow-2xl shadow-black/50">
						<div className="flex items-center justify-around px-2 py-2">
							{navItems.map((item) => {
								const href = item.href || item.subItems?.[0]?.href;
								if (!href) return null;

								const isActive = item.subItems
									? item.subItems.some((subItem) => pathname === subItem.href)
									: pathname === href;
								const Icon = item.icon;

								return (
									<Link
										key={href}
										to={href}
										className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition-all relative ${
											isActive
												? "bg-linear-to-t from-lime-500/20 to-transparent"
												: "hover:bg-gray-800/30"
										}`}
									>
										{isActive && (
											<div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-linear-to-r from-lime-400 to-green-500 rounded-full shadow-lg shadow-lime-500/50" />
										)}
										<div className="p-1.5 rounded-lg transition-all">
											<Icon
												size={22}
												className={`transition-all ${isActive ? "text-lime-400" : "text-gray-400"}`}
											/>
										</div>
										<span
											className={`text-[10px] font-semibold transition-all ${
												isActive ? "text-lime-400" : "text-gray-500"
											}`}
										>
											{item.label}
										</span>
									</Link>
								);
							})}
						</div>
					</div>
				</nav>
			)}
		</>
	);
}
