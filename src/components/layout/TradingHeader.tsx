"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export function TradingHeader() {
	return (
		<div className="flex items-center h-[69px] bg-gradient-to-r from-[#0a0b17] to-[#141623] border-b border-gray-800">
			<div className="flex items-center flex-1 px-6">
				{/* Logo */}
				<div className="flex items-center">
					<span className="text-[#41c6b2] text-[23px] font-bold mr-2">
						contan
					</span>
					<div className="w-[29px] h-[23px] bg-[#41c6b2] rounded-sm"></div>
				</div>

				{/* Navigation */}
				<nav className="flex items-center ml-10 space-x-8">
					<div className="relative">
						<span className="text-[#bbbdc0] text-[13px] font-bold cursor-pointer">
							Advanced
						</span>
						<div className="absolute -top-1 -right-8 bg-[#09222b] border border-[#077175] rounded-md px-2 py-1">
							<span className="text-[#198680] text-[8px] font-light">New</span>
						</div>
					</div>
					<span className="text-[#797b81] text-[13px] font-bold cursor-pointer">
						Simplified
					</span>
					<span className="text-[#808287] text-[13px] font-bold cursor-pointer">
						Staking
					</span>
					<span className="text-[#7d7f84] text-[13px] font-bold cursor-pointer">
						oTango
					</span>
					<span className="text-[#7b7d82] text-[13px] font-bold cursor-pointer">
						Profile
					</span>
					<span className="text-[#7e8085] text-[13px] font-bold cursor-pointer">
						Airdrop
					</span>
				</nav>

				{/* Right side */}
				<div className="flex items-center ml-auto space-x-4">
					<span className="text-[#6f7377] text-[10px] font-bold">
						Resources
					</span>
					<div className="text-[#85888c] text-[12px] leading-[15px]">
						<div>Fee Profile</div>
						<div>25 bps/5 bps</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="bg-[#0a0b17] border-[#272a3b] text-[#b9b9bc] text-[13px] font-bold hover:bg-[#141623]"
					>
						Connect Wallet
					</Button>
				</div>
			</div>
		</div>
	);
}
