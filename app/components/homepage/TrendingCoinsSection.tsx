import { Skeleton } from "@app/components/ui/skeleton";
import { fetchTokensTrending } from "@app/hooks/useTrending";
import { cn } from "@app/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

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
	price?: string;
	priceUsd?: number | string;
	change24h?: string | number;
	trend?: "up" | "down";
	logo?: string;
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
	const navigate = useNavigate();

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

		navigate(`/perp?${params.toString()}`);
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
			<div
				className="absolute inset-0 rounded-4xl"
				style={{
					background: `radial-gradient(ellipse at center, #0a0a0a 0%, #0a0a0a 40%, rgba(104, 104, 104, 0.15) 70%, rgba(104, 104, 104, 0.25) 100%)`,
				}}
			/>
			<div className="relative z-10 flex items-center w-full">
				<img
					src={icon}
					alt={title}
					width={80}
					height={80}
					loading="lazy"
					// quality={75}
					sizes="40px"
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

// Convert API data to Pill format
const convertToPills = (tokens: TrendingToken[]): Pill[] => {
	if (!tokens || tokens.length === 0) return [];

	return tokens.slice(0, 12).map((token) => {
		const changeValue =
			typeof token.change24h === "number" ? token.change24h : parseFloat(token.change24h || "0");
		const changeColor: Pill["changeColor"] = changeValue >= 0 ? "green" : "red";

		return {
			icon: token.logo && token.logo !== "🪙" ? token.logo : "/assets/trending-coins/default.png",
			title: token.symbol,
			price: token.price,
			change:
				typeof token.change24h === "number" ? `${token.change24h.toFixed(2)}%` : token.change24h,
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

export const TrendingCoinsSection: FC = () => {
	// SSR-safe timeout implementation
	const [isReady, setIsReady] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setIsReady(true), 15_000);
		return () => clearTimeout(timer);
	}, []);

	// Fetch trending tokens from API
	const { data: trendingData, isLoading: loading } = useQuery({
		queryKey: ["trending-coins", isReady],
		queryFn: async () => {
			const data = await fetchTokensTrending({ limit: 50, page: 1 });
			return data.data as TrendingToken[];
		},
		enabled: isReady,
	});

	const pills = convertToPills(trendingData || []);
	const top = pills.slice(0, Math.ceil(pills.length / 2));
	const bottom = pills.slice(Math.ceil(pills.length / 2));

	// stable skeleton IDs
	const skeletonIds = useMemo(() => Array.from({ length: 18 }).map((_, i) => `skeleton-${i}`), []);

	// Refs for measurement & dynamic repetition
	const containerRef = useRef<HTMLDivElement | null>(null);
	const topBaseRef = useRef<HTMLDivElement | null>(null);
	const bottomBaseRef = useRef<HTMLDivElement | null>(null);

	const [topRepeat, setTopRepeat] = useState(2);
	const [bottomRepeat, setBottomRepeat] = useState(2);

	useEffect(() => {
		const recalc = () => {
			const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
			const topBaseWidth = topBaseRef.current?.scrollWidth || 0;
			const bottomBaseWidth = bottomBaseRef.current?.scrollWidth || 0;

			const topNeeded =
				topBaseWidth <= 0 ? 2 : Math.max(2, Math.ceil((containerWidth * 2) / topBaseWidth));
			const bottomNeeded =
				bottomBaseWidth <= 0 ? 2 : Math.max(2, Math.ceil((containerWidth * 2) / bottomBaseWidth));

			setTopRepeat(topNeeded);
			setBottomRepeat(bottomNeeded);
		};

		recalc();
		const onResize = () => recalc();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Show loading state
	if (loading || pills.length === 0) {
		const SkeletonPill = ({ minWidth }: { minWidth: number }) => (
			<div className={cn(basePill, "pl-2 pr-6 py-2")} style={{ minWidth }}>
				<div
					className="absolute inset-0 rounded-4xl"
					style={{
						background: `radial-gradient(ellipse at center, #0a0a0a 0%, #0a0a0a 40%, rgba(104, 104, 104, 0.15) 70%, rgba(104, 104, 104, 0.25) 100%)`,
					}}
				/>
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
				<div
					ref={containerRef}
					className="relative mx-auto max-w-7xl h-64 flex flex-col items-start justify-center"
				>
					{/* Hidden base containers used to measure a single sequence width for top & bottom */}
					<div className="sr-only" aria-hidden>
						<div ref={topBaseRef} className="inline-flex items-center gap-5">
							{skeletonIds.map((id) => (
								<SkeletonPill key={`skeleton-base-top-${id}`} minWidth={153} />
							))}
						</div>
						<div ref={bottomBaseRef} className="inline-flex items-center gap-5 mt-5">
							{skeletonIds.map((id) => (
								<SkeletonPill key={`skeleton-base-bottom-${id}`} minWidth={170} />
							))}
						</div>
					</div>

					<div className="inline-flex items-center gap-5 md:ml-[152px] md:mr-[34px] animate-scroll-ticker whitespace-nowrap">
						{Array.from({ length: topRepeat }).flatMap((_, idx) =>
							skeletonIds.map((id) => (
								<SkeletonPill key={`skeleton-top-${idx}-${id}`} minWidth={153} />
							)),
						)}
					</div>
					<div className="inline-flex items-center gap-5 mt-5 animate-scroll-ticker-reverse whitespace-nowrap">
						{Array.from({ length: bottomRepeat }).flatMap((_, idx) =>
							skeletonIds.map((id) => (
								<SkeletonPill key={`skeleton-bottom-${idx}-${id}`} minWidth={170} />
							)),
						)}
					</div>
				</div>
				<div className="absolute inset-y-0 left-0 w-[30%] [background:linear-gradient(to_right,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
				<div className="absolute inset-y-0 right-0 w-[30%] [background:linear-gradient(to_left,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
			</section>
		);
	}

	return (
		<section className="relative w-full overflow-hidden">
			<div
				ref={containerRef}
				className="relative mx-auto max-w-7xl h-64 flex flex-col items-start justify-center"
			>
				{/* Hidden base containers used to measure a single sequence width for top & bottom */}
				<div className="sr-only" aria-hidden>
					<div ref={topBaseRef} className="inline-flex items-center gap-5">
						{top.map((p, i) => (
							<PillItem key={`top-base-${p.title}-${i}`} {...p} width={153} />
						))}
					</div>
					<div ref={bottomBaseRef} className="inline-flex items-center gap-5 mt-5">
						{bottom.map((p, i) => (
							<PillItem
								key={`bottom-base-${p.title.replace(/\s+/g, "-")}-${i}`}
								{...p}
								width={170}
							/>
						))}
					</div>
				</div>

				<div className="inline-flex items-center gap-5 md:ml-[152px] md:mr-[34px] animate-scroll-ticker whitespace-nowrap">
					{Array.from({ length: topRepeat }).flatMap((_, idx) =>
						top.map((p, i) => <PillItem key={`top-${p.title}-${idx}-${i}`} {...p} width={153} />),
					)}
				</div>

				<div className="inline-flex items-center gap-5 mt-5 animate-scroll-ticker-reverse whitespace-nowrap">
					{Array.from({ length: bottomRepeat }).flatMap((_, idx) =>
						bottom.map((p, i) => (
							<PillItem
								key={`bottom-${p.title.replace(/\s+/g, "-")}-${idx}-${i}`}
								{...p}
								width={170}
							/>
						)),
					)}
				</div>
			</div>
			<div className="absolute inset-y-0 left-0 w-[30%] [background:linear-gradient(to_right,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
			<div className="absolute inset-y-0 right-0 w-[30%] [background:linear-gradient(to_left,#000_0%,rgba(0,0,0,0.7)_60%,rgba(0,0,0,0)_100%)] pointer-events-none z-10" />
		</section>
	);
};
