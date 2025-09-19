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
					{/* Trading Section */}
					<div className="flex items-center space-x-6">
						<Link
							href="/"
							className={`font-bold text-sm transition-colors ${
								pathname === "/" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							Advanced
						</Link>
						<Link
							href="/simplified"
							className={`font-bold text-sm transition-colors ${
								pathname === "/simplified" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							Simplified
						</Link>
					</div>

					{/* Main Navigation */}
					<div className="flex items-center space-x-6">
						<Link
							href="/staking"
							className={`font-bold text-sm transition-colors ${
								pathname === "/staking" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							Staking
						</Link>
						<Link
							href="/otango"
							className={`font-bold text-sm transition-colors ${
								pathname === "/otango" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							oTango
						</Link>
						<Link
							href="/profile"
							className={`font-bold text-sm transition-colors ${
								pathname === "/profile" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							Profile
						</Link>
						<Link
							href="/airdrop"
							className={`font-bold text-sm transition-colors ${
								pathname === "/airdrop" ? "text-gray-400" : "text-gray-500 hover:text-gray-400"
							}`}
						>
							Airdrop
						</Link>
					</div>
				</nav>

				{/* Right Section */}
				<div className="flex items-center space-x-6">
					{/* Resources */}
					<Link
						href="/resources"
						className={`font-bold text-sm transition-colors ${
							pathname === "/resources" ? "text-gray-500" : "text-gray-600 hover:text-gray-500"
						}`}
					>
						Resources
					</Link>

					{/* Fee Profile */}
					<div className="text-right">
						<div className="text-gray-400 text-xs font-medium">Fee Profile</div>
						<div className="text-gray-400 text-xs">25 bps/5 bps</div>
					</div>

					{/* Connect Wallet Button */}
					<ConnectWallet />
				</div>
			</div>
		</header>
	);
}
