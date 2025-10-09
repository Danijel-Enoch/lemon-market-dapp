"use client";

import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

export function Header() {
	const pathname = usePathname();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const navItems = [
		{ href: "/trending", label: "Trending" },
		{ href: "/positions", label: "Positions" },
		{ href: "/bridge", label: "Bridge" },
		{ href: "/staking", label: "Stake" },
	];

	return (
		<div className="w-full p-4 md:p-8">
			<motion.header
				initial={{ opacity: 0.5 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6 }}
				className="max-w-screen-2xl mx-auto flex items-center justify-between rounded-xl backdrop-blur-md px-8 md:px-12 py-4 bg-[#13151b99] border border-gray-100/10"
			>
				<Link href="/" className="inline-flex items-center gap-3.5">
					<Image src="/image/logo.png" alt="Lemon Markets" width={39} height={40} />
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

				<button
					type="button"
					onClick={() => setIsMenuOpen(!isMenuOpen)}
					className="md:hidden text-white"
				>
					{isMenuOpen ? <X size={24} /> : <Menu size={24} />}
				</button>

				{isMenuOpen && (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						className="md:hidden absolute top-full left-0 right-0 mt-4 pb-4 border-t border-white/20 bg-gray-900/90 backdrop-blur-md rounded-b-lg"
					>
						<nav className="flex flex-col space-y-4 mt-4 px-6">
							{navItems.map((item) => {
								const isActive = pathname === item.href;
								return (
									<Link
										key={item.href}
										href={item.href}
										className={`text-lg font-medium transition-all ${
											isActive
												? "bg-gradient-to-r from-lime-300 via-green-600 to-green-950 bg-clip-text text-transparent"
												: "text-white hover:bg-gradient-to-r hover:from-lime-400 hover:to-green-500 hover:bg-clip-text hover:text-transparent"
										}`}
										onClick={() => setIsMenuOpen(false)}
									>
										{item.label}
									</Link>
								);
							})}
							<ConnectWallet text="Get Started" />
						</nav>
					</motion.div>
				)}
			</motion.header>
		</div>
	);
}
