"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/AppContext";

export function Header() {
	const { state, dispatch } = useAppContext();

	const handleConnectWallet = () => {
		// Mock wallet connection
		dispatch({
			type: "SET_WALLET_CONNECTION",
			payload: {
				isConnected: !state.isConnected,
				address: state.isConnected ? null : "0x1234...5678",
			},
		});
		if (!state.isConnected) {
			dispatch({ type: "SET_BALANCE", payload: 2.456 });
		}
	};

	return (
		<header className="border-b border-gray-800/50 bg-gray-950 text-white">
			<div className="flex items-center justify-between px-4 py-3">
				{/* Logo and Navigation */}
				<div className="flex items-center space-x-6 gap-4">
					<div className="flex items-center space-x-2">
						<div className="text-xl font-bold text-white">Contango</div>
					</div>

					<nav className="hidden md:flex items-center space-x-1 gap-4">
						<Button
							variant="ghost"
							size="sm"
							className="text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 h-8 text-sm font-medium"
						>
							Trade
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 h-8 text-sm"
						>
							Strategies
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 h-8 text-sm"
						>
							Portfolio
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 h-8 text-sm"
						>
							Analytics
						</Button>
					</nav>
				</div>

				{/* Stats */}
				<div className="hidden lg:flex items-center space-x-6 gap-4 text-xs">
					<div className="text-center">
						<div className="text-gray-500">Total Volume</div>
						<div className="font-medium text-white">$3.1B</div>
					</div>
					<div className="text-center">
						<div className="text-gray-500">Open Interest</div>
						<div className="font-medium text-white">$279.9M</div>
					</div>
					<div className="text-center">
						<div className="text-gray-500">Users</div>
						<div className="font-medium text-white">15,868</div>
					</div>
				</div>

				{/* Right Side Actions */}
				<div className="flex items-center space-x-2 gap-4">
					{/* Network Selector */}
					<div className="hidden md:flex items-center space-x-2 gap-4 bg-gray-800 rounded-md px-2 py-1.5 text-sm">
						<div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
						<span>Ethereum</span>
					</div>

					{/* Wallet Connection */}
					{state.isConnected ? (
						<div className="flex items-center space-x-2 gap-4">
							<div className="text-right text-xs">
								<div className="text-gray-400">
									{state.balance.toFixed(3)} ETH
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleConnectWallet}
								className="border-gray-700 text-white hover:bg-gray-800 h-8 px-3 text-sm"
							>
								{state.walletAddress}
							</Button>
						</div>
					) : (
						<Button
							onClick={handleConnectWallet}
							size="sm"
							className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-sm"
						>
							Connect Wallet
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
