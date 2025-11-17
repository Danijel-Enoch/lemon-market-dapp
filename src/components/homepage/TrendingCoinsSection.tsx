"use client";

import Image from "next/image";
import type { FC } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAsync } from "react-use";
import { Skeleton } from "@/components/ui/skeleton";

type Pill = {
	icon: string;
	title: string;
	price?: string;
	change?: string;
	changeColor?: "red" | "green" | "gray";
	width?: number;
	largeIcon?: boolean;
};

type TrendingToken = {
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	trend: "up" | "down";
	logo: string;
};

const basePill =
	"flex shrink-0 items-center justify-between border-2 border-[#686868] rounded-4xl bg-[#0a0a0a] backdrop-blur-md";

const Title = ({ children }: { children: string }) => (
	<span className="text-xs font-semibold text-white whitespace-nowrap">{children}</span>
);

const Sub = ({ children, color = "#dedede" }: { children: string; color?: string }) => (
	<span className={cn("text-sm font-semibold", `text-[${color}]`)}>
		{children}
	</span>
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
	largeIcon,
}) => {
	return (
		<div
			className={cn(basePill, largeIcon ? "pl-3" : "pl-2", "pr-6 py-2")}
			style={{ minWidth: width }}
		>
			<Image
				src={icon}
				alt={title}
				width={largeIcon ? 44 : 40}
				height={largeIcon ? 44 : 40}
				className={cn(
					largeIcon ? "rounded-full w-[44px] h-[44px]" : "rounded-full w-[40px] h-[40px]",
				)}
			/>
			<div className="flex flex-col items-start self-stretch ml-2">
				<Title>{title}</Title>
				<div className="flex items-center justify-between self-stretch gap-2 mt-0.5">
					{price ? <Sub>{price}</Sub> : null}
					{change ? <Change value={change} color={changeColor} /> : null}
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
		} catch (error) {
			console.error("Failed to fetch trending tokens:", error);
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
				largeIcon: Math.random() > 0.5, // Randomly vary icon sizes for visual interest
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
				<Skeleton className="w-10 h-10 rounded-full" />
				<div className="flex flex-col gap-2 ml-2">
					<Skeleton className="h-3 w-16" />
					<div className="flex gap-2">
						<Skeleton className="h-3 w-12" />
						<Skeleton className="h-3 w-12" />
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
							<SkeletonPill key={`skeleton-top-${i}`} minWidth={153} />
						))}
					</motion.div>

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
							<SkeletonPill key={`skeleton-bottom-${i}`} minWidth={170} />
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
						<PillItem key={`top-${i}`} {...p} />
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
						<PillItem key={`bottom-${i}`} {...p} />
					))}
				</motion.div>
			</div>
			<div className="absolute inset-y-0 left-0 w-[30%] [background:linear-gradient(to_right,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
			<div className="absolute inset-y-0 right-0 w-[30%] [background:linear-gradient(to_left,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
		</section>
	);
};
