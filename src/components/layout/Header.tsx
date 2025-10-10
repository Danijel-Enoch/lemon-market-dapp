"use client";

import { motion } from "framer-motion";
import { TrendingUp, Wallet, ArrowLeftRight, Coins } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { useMiniApp } from "@/components/providers/MiniAppProvider";

export function Header() {
	const pathname = usePathname();
	const { isMiniApp, context } = useMiniApp();

	const navItems = [
		{ href: "/trending", label: "Trending", icon: TrendingUp },
		{ href: "/positions", label: "Positions", icon: Wallet },
		{ href: "/bridge", label: "Bridge", icon: ArrowLeftRight },
		{ href: "/staking", label: "Stake", icon: Coins }
	];

	// Apply safe area insets if in Mini App
	const safeAreaStyle =
		isMiniApp && context?.client.safeAreaInsets
			? {
					paddingTop: context.client.safeAreaInsets.top
			  }
			: {};

	return (
		<>
			<div className="w-full p-4 md:p-8" style={safeAreaStyle}>
				<motion.header
					initial={{ opacity: 0.5 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.6 }}
					className="max-w-screen-2xl mx-auto flex items-center justify-between rounded-xl backdrop-blur-md px-8 md:px-12 py-4 bg-[#13151b99] border border-gray-100/10"
				>
					<Link href="/" className="inline-flex items-center gap-3.5">
						<Image
							src="/image/logo.png"
							alt="Lemon Markets"
							width={39}
							height={40}
						/>
						<span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent font-semibold text-xl">
							Lemon Markets
						</span>
					</Link>

					<nav className="hidden md:inline-flex items-center gap-9">
						{navItems.map((item) => {
							const isActive = pathname === item.href;
							return (
								<Link
									key={item.href}
									href={item.href}
									className={`transition-all text-sm leading-tight ${
										isActive
											? "bg-gradient-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent font-semibold"
											: "bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent hover:from-lime-400 hover:to-green-500"
									}`}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>

					<ConnectWallet text="Get Started" />
				</motion.header>
			</div>

			{/* Mobile Bottom Navigation */}
			<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#13151b] border-t border-gray-100/10 backdrop-blur-md z-50">
				<div className="flex items-center justify-around px-2 py-3">
					{navItems.map((item) => {
						const isActive = pathname === item.href;
						const Icon = item.icon;
						return (
							<Link
								key={item.href}
								href={item.href}
								className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[70px] ${
									isActive
										? "bg-gradient-to-r from-lime-300/10 via-green-600/10 to-green-950/10"
										: ""
								}`}
							>
								<Icon
									size={20}
									className={`transition-all ${
										isActive
											? "text-lime-400"
											: "text-gray-400"
									}`}
								/>
								<span
									className={`text-xs font-medium transition-all ${
										isActive
											? "bg-gradient-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent"
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
		</>
	);
}
