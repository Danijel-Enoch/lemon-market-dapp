"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

export function Header() {
	const pathname = usePathname();

	return (
		<header className="h-16 px-6 border-b border-slate-800">
			<div className="flex items-center justify-between h-full mx-auto">
				{/* Logo */}
				<div className="flex items-center">
					<Link
						href="/"
						className="text-teal-400 font-bold text-xl leading-none hover:text-teal-300 transition-colors"
					>
						lemon-looper
					</Link>
				</div>

				{/* Navigation */}
				<nav className="flex items-center space-x-8">
					{/* Main Navigation */}
					<div className="flex items-center space-x-6">
						<Link
							href="/"
							className={`font-bold text-sm transition-colors ${
								pathname === "/"
									? "text-gray-400"
									: "text-gray-500 hover:text-gray-400"
							}`}
						>
							Trending
						</Link>
						<Link
							href="/perp"
							className={`font-bold text-sm transition-colors ${
								pathname === "/perp"
									? "text-gray-400"
									: "text-gray-500 hover:text-gray-400"
							}`}
						>
							Perp
						</Link>
						<Link
							href="/bridge"
							className={`font-bold text-sm transition-colors ${
								pathname === "/bridge"
									? "text-gray-400"
									: "text-gray-500 hover:text-gray-400"
							}`}
						>
							Bridge
						</Link>
						<Link
							href="/staking"
							className={`font-bold text-sm transition-colors ${
								pathname === "/staking"
									? "text-gray-400"
									: "text-gray-500 hover:text-gray-400"
							}`}
						>
							Staking
						</Link>
					</div>
				</nav>

				{/* Right Section */}
				<div className="flex items-center space-x-6">
					{/* Leaderboard */}
					<Link
						href="/leaderboard"
						className={`font-bold text-sm transition-colors ${
							pathname === "/leaderboard"
								? "text-gray-500"
								: "text-gray-600 hover:text-gray-500"
						}`}
					>
						Leaderboard
					</Link>

					{/* Fee Profile */}
					<div className="text-right">
						<div className="text-gray-400 text-xs font-medium">
							Fee Profile
						</div>
						<div className="text-gray-400 text-xs">
							25 bps/5 bps
						</div>
					</div>

					{/* Connect Wallet Button */}
					<ConnectWallet />
				</div>
			</div>
		</header>
	);
}
