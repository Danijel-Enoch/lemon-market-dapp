"use client";

import { useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { ChevronDown, Check } from "lucide-react";
import Image from "next/image";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
	getAllSupportedChains,
	getChainInfo,
	isChainSupportedInEnvironment,
	type ChainInfo
} from "@/lib/chain-utils";

interface ChainSelectorProps {
	className?: string;
	showTestnets?: boolean;
}

export function ChainSelector({
	className = "",
	showTestnets
}: ChainSelectorProps) {
	const chainId = useChainId();
	const { switchChain, isPending } = useSwitchChain();
	const [isOpen, setIsOpen] = useState(false);

	const currentChain = getChainInfo(chainId);
	const allChains = getAllSupportedChains();

	// Filter chains based on environment and showTestnets prop
	const availableChains = allChains.filter((chain) => {
		if (!isChainSupportedInEnvironment(chain.id)) return false;
		if (!showTestnets && chain.isTestnet) return false;
		return true;
	});

	const handleChainSwitch = async (targetChainId: number) => {
		try {
			await switchChain({ chainId: targetChainId });
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to switch chain:", error);
		}
	};

	if (!currentChain) {
		return (
			<div
				className={`flex items-center gap-2 text-orange-500 ${className}`}
			>
				<div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
					<span className="text-xs font-bold text-white">?</span>
				</div>
				<span className="text-sm font-medium">Unsupported Network</span>
			</div>
		);
	}

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					className={`
						flex items-center gap-2 px-3 py-2 rounded-lg border
						bg-white/5 border-white/10 hover:bg-white/10
						transition-colors duration-200 min-w-0
						${isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
						${className}
					`}
					disabled={isPending}
				>
					<div className="flex items-center gap-2 min-w-0">
						<div className="relative w-6 h-6 flex-shrink-0">
							<Image
								src={currentChain.icon}
								alt={currentChain.name}
								width={24}
								height={24}
								className="rounded-full"
							/>
						</div>
						<span className="text-sm font-medium text-white truncate">
							{currentChain.shortName}
						</span>
					</div>
					<ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-64">
				<div className="px-3 py-2 border-b border-gray-700">
					<p className="text-sm font-medium text-gray-300">
						Select Network
					</p>
				</div>

				{availableChains.map((chain) => (
					<DropdownMenuItem
						key={chain.id}
						onClick={() => handleChainSwitch(chain.id)}
						className={`
							flex items-center gap-3 px-3 py-3 cursor-pointer
							hover:bg-gray-700/50 transition-colors duration-200
							${chain.id === chainId ? "bg-blue-500/10" : ""}
						`}
					>
						<div className="relative w-8 h-8 flex-shrink-0">
							<Image
								src={chain.icon}
								alt={chain.name}
								width={32}
								height={32}
								className="rounded-full"
							/>
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium text-white">
									{chain.name}
								</span>
								{chain.isTestnet && (
									<span className="px-2 py-0.5 text-xs bg-orange-500/20 text-orange-300 rounded-md">
										Testnet
									</span>
								)}
							</div>
							<p className="text-xs text-gray-400 truncate">
								{chain.symbol} • Chain ID: {chain.id}
							</p>
						</div>

						{chain.id === chainId && (
							<Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
						)}
					</DropdownMenuItem>
				))}

				{availableChains.length === 0 && (
					<div className="px-3 py-6 text-center text-gray-400">
						<p className="text-sm">No networks available</p>
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface ChainBadgeProps {
	chainId: number;
	className?: string;
}

export function ChainBadge({ chainId, className = "" }: ChainBadgeProps) {
	const chain = getChainInfo(chainId);

	if (!chain) {
		return (
			<span
				className={`inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded ${className}`}
			>
				<span className="w-3 h-3 rounded-full bg-red-500" />
				Unknown
			</span>
		);
	}

	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-500/20 text-gray-300 rounded ${className}`}
		>
			<div className="relative w-3 h-3">
				<Image
					src={chain.icon}
					alt={chain.name}
					width={12}
					height={12}
					className="rounded-full"
				/>
			</div>
			{chain.shortName}
			{chain.isTestnet && <span className="text-orange-300">•T</span>}
		</span>
	);
}
