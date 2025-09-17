"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export function TradingHeader() {
	return (
		<div className="flex items-center gap-4 h-[80px] bg-gradient-to-r from-[#0a0b17] to-[#141623] border-b border-gray-800">
			<div className="flex items-center flex-1 gap-4 px-8">
				{/* Logo */}
				<div className="flex items-center gap-4">
					<span className="text-[#41c6b2] text-[26px] font-bold mr-3">
						contan
					</span>
					<div className="w-[32px] h-[26px] bg-[#41c6b2] rounded-sm"></div>
				</div>

				{/* Navigation */}
				<nav className="flex items-center ml-12 space-x-10 gap-4">
					<div className="relative">
						<span className="text-[#bbbdc0] text-[14px] font-bold cursor-pointer">
							Advanced
						</span>
						<div className="absolute -top-1 -right-9 bg-[#09222b] border border-[#077175] rounded-md px-2 py-1">
							<span className="text-[#198680] text-[9px] font-light">New</span>
						</div>
					</div>
					<span className="text-[#797b81] text-[14px] font-bold cursor-pointer">
						Simplified
					</span>
					<span className="text-[#808287] text-[14px] font-bold cursor-pointer">
						Staking
					</span>
					<span className="text-[#7d7f84] text-[14px] font-bold cursor-pointer">
						oTango
					</span>
					<span className="text-[#7b7d82] text-[14px] font-bold cursor-pointer">
						Profile
					</span>
					<span className="text-[#7e8085] text-[14px] font-bold cursor-pointer">
						Airdrop
					</span>
				</nav>

				{/* Right side */}
				<div className="flex items-center ml-auto space-x-6 gap-4">
					<span className="text-[#6f7377] text-[11px] font-bold">
						Resources
					</span>
					<div className="text-[#85888c] text-[13px] leading-[16px]">
						<div>Fee Profile</div>
						<div>25 bps/5 bps</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="bg-[#0a0b17] border-[#272a3b] text-[#b9b9bc] text-[14px] font-bold hover:bg-[#141623] px-6 py-2"
					>
						Connect Wallet
					</Button>
				</div>
			</div>
		</div>
	);
}
