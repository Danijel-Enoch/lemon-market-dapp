"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FC } from "react";
import { useAsync } from "react-use";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Pill = {
	icon: string;
	title: string;
	price?: string;
	change?: string;
	changeColor?: "red" | "green" | "gray";
	width?: number;
	largeIcon?: boolean;
	tokenData?: {
		symbol: string;
		tokenAddress?: string;
		pairAddress?: string;
		chain?: string;
	};
};

type TrendingToken = {
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	trend: "up" | "down";
	logo: string;
	tokenAddress?: string;
	pairAddress?: string;
	chain?: string;
};

const basePill =
	"flex shrink-0 items-center justify-between border border-[#686868]/70 rounded-4xl backdrop-blur-md relative overflow-hidden";

const Title = ({ children }: { children: string }) => (
	<span className="text-xs font-semibold text-white whitespace-nowrap">{children}</span>
);

const Sub = ({ children, color = "#dedede" }: { children: string; color?: string }) => (
	<span className={cn("text-sm font-semibold", `text-[${color}]`)}>{children}</span>
);

const Change = ({ value, color }: { value: string; color?: Pill["changeColor"] }) => {
	const map: Record<string, string> = {
		red: "text-[#ff4c4c]",
		green: "text-[#4dad31]",
		gray: "text-[#dedede]",
	};
	return (
		<span className={cn("text-sm font-semibold", color ? map[color] : "text-[#dedede]")}>
			{value}
		</span>
	);
};

const PillItem: FC<Pill> = ({
	icon,
	title,
	price,
	change,
	width,
	changeColor = "gray",
	tokenData,
}) => {
	const router = useRouter();

	const handleClick = () => {
		if (!tokenData) return;

		const params = new URLSearchParams();
		params.set("symbol", tokenData.symbol);

		if (tokenData.pairAddress) {
			params.set("pairAddress", tokenData.pairAddress);
		}
		if (tokenData.tokenAddress) {
			params.set("tokenAddress", tokenData.tokenAddress);
		}
		if (tokenData.chain) {
			params.set("chain", tokenData.chain);
		}

		router.push(`/perp?${params.toString()}`);
	};

	return (
		<div
			className={cn(
				basePill,
				"pl-2 pr-6 py-2",
				tokenData && "cursor-pointer hover:border-[#686868] transition-colors",
			)}
			style={{ minWidth: width }}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (tokenData && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					handleClick();
				}
			}}
			role={tokenData ? "button" : undefined}
			tabIndex={tokenData ? 0 : undefined}
		>
			{/* Glow effect background - blends border color into the center */}
			<div
				className="absolute inset-0 rounded-4xl"
				style={{
					background: `radial-gradient(ellipse at center, #0a0a0a 0%, #0a0a0a 40%, rgba(104, 104, 104, 0.15) 70%, rgba(104, 104, 104, 0.25) 100%)`,
				}}
			/>
			{/* Content layer */}
			<div className="relative z-10 flex items-center w-full">
				<Image
					src={icon}
					alt={title}
					width={40}
					height={40}
					className="rounded-full w-10 h-10 border border-gray-800/70"
				/>
				<div className="flex flex-col items-start self-stretch ml-2">
					<Title>{title}</Title>
					<div className="flex items-center justify-between self-stretch gap-2 mt-0.5">
						{price ? <Sub>{price}</Sub> : null}
						{change ? <Change value={change} color={changeColor} /> : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export const TrendingCoinsSection: FC = () => {
	// Fetch trending tokens from API
	const { value: trendingData, loading } = useAsync(async () => {
		try {
			const response = await fetch("/api/trending/tokens");
			const data = await response.json();
			return data.data as TrendingToken[];
		} catch (_error) {
			return [];
		}
	}, []);

	// Convert API data to Pill format
	const convertToPills = (tokens: TrendingToken[]): Pill[] => {
		if (!tokens || tokens.length === 0) return [];

		return tokens.slice(0, 12).map((token) => {
			const changeValue = parseFloat(token.change24h);
			const changeColor: Pill["changeColor"] = changeValue >= 0 ? "green" : "red";

			return {
				icon: token.logo && token.logo !== "🪙" ? token.logo : "/assets/trending-coins/default.png",
				title: token.symbol,
				price: token.price,
				change: token.change24h,
				changeColor,
				largeIcon: false,
				tokenData: {
					symbol: token.symbol,
					tokenAddress: token.tokenAddress,
					pairAddress: token.pairAddress,
					chain: token.chain,
				},
			};
		});
	};

	const pills = convertToPills(trendingData || []);
	const top = pills.slice(0, Math.ceil(pills.length / 2));
	const bottom = pills.slice(Math.ceil(pills.length / 2));

	// Show loading state
	if (loading || pills.length === 0) {
		const SkeletonPill = ({ minWidth }: { minWidth: number }) => (
			<div className={cn(basePill, "pl-2 pr-6 py-2")} style={{ minWidth }}>
				{/* Glow effect background */}
				<div
					className="absolute inset-0 rounded-4xl"
					style={{
						background: `radial-gradient(ellipse at center, #0a0a0a 0%, #0a0a0a 40%, rgba(104, 104, 104, 0.15) 70%, rgba(104, 104, 104, 0.25) 100%)`,
					}}
				/>
				{/* Content layer */}
				<div className="relative z-10 flex items-center w-full">
					<Skeleton className="w-10 h-10 rounded-full" />
					<div className="flex flex-col gap-2 ml-2">
						<Skeleton className="h-3 w-16" />
						<div className="flex gap-2">
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-3 w-12" />
						</div>
					</div>
				</div>
			</div>
		);

		return (
			<section className="relative w-full overflow-hidden">
				<div className="relative mx-auto max-w-[1248px] h-[273px] flex flex-col items-start justify-center">
					{/* Top row skeleton with animation */}
					<motion.div
						className="inline-flex items-center gap-5 ml-[152px] mr-[34px]"
						animate={{
							x: [0, -1000],
						}}
						transition={{
							x: {
								repeat: Infinity,
								repeatType: "loop",
								duration: 30,
								ease: "linear",
							},
						}}
					>
						{Array.from({ length: 18 }).map((_, i) => (
							<SkeletonPill key={`skeleton-top-${Date.now()}-${i}`} minWidth={153} />
						))}
					</motion.div>{" "}
					{/* Bottom row skeleton with animation */}
					<motion.div
						className="inline-flex items-center gap-5 mt-5"
						animate={{
							x: [-1000, 0],
						}}
						transition={{
							x: {
								repeat: Infinity,
								repeatType: "loop",
								duration: 30,
								ease: "linear",
							},
						}}
					>
						{Array.from({ length: 18 }).map((_, i) => (
							<SkeletonPill key={`skeleton-bottom-${Date.now()}-${i}`} minWidth={170} />
						))}
					</motion.div>
				</div>
				<div className="absolute inset-y-0 left-0 w-[30%] [background:linear-gradient(to_right,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
				<div className="absolute inset-y-0 right-0 w-[30%] [background:linear-gradient(to_left,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
			</section>
		);
	}

	return (
		<section className="relative w-full overflow-hidden">
			<div className="relative mx-auto max-w-[1248px] h-[273px] flex flex-col items-start justify-center">
				<motion.div
					className="inline-flex items-center gap-5 ml-[152px] mr-[34px]"
					animate={{
						x: [0, -1000],
					}}
					transition={{
						x: {
							repeat: Infinity,
							repeatType: "loop",
							duration: 30,
							ease: "linear",
						},
					}}
				>
					{/* Duplicate items for seamless loop */}
					{[...top, ...top, ...top].map((p, i) => (
						<PillItem key={`top-${p.title}-${i}`} {...p} />
					))}
				</motion.div>

				<motion.div
					className="inline-flex items-center gap-5 mt-5"
					animate={{
						x: [-1000, 0],
					}}
					transition={{
						x: {
							repeat: Infinity,
							repeatType: "loop",
							duration: 30,
							ease: "linear",
						},
					}}
				>
					{/* Duplicate items for seamless loop */}
					{[...bottom, ...bottom, ...bottom].map((p, i) => (
						<PillItem key={`bottom-${p.title.replace(/\s+/g, "-")}-${i}`} {...p} />
					))}
				</motion.div>
			</div>
			<div className="absolute inset-y-0 left-0 w-[30%] [background:linear-gradient(to_right,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
			<div className="absolute inset-y-0 right-0 w-[30%] [background:linear-gradient(to_left,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
		</section>
	);
};
