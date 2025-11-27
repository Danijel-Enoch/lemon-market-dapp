"use client";

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAsyncFn from "react-use/lib/useAsyncFn";
import useEvent from "react-use/lib/useEvent";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTokensTrending } from "@/hooks/useTrending";

interface TickerToken {
	symbol: string;
	priceChange24h: number;
	isLong: boolean;
	logo?: string;
	pairAddress?: string;
	tokenAddress?: string;
	chain?: string;
	assetType?: string;
}

const TickerItem: FC<{ token: TickerToken; isActive?: boolean }> = ({ token, isActive }) => {
	const isPositive = token.priceChange24h > 0;
	const changeStr = `${isPositive ? "+" : ""}${token.priceChange24h.toFixed(2)}%`;
	const navigate = useNavigate();
	const canNavigate = Boolean(token.symbol || token.tokenAddress || token.pairAddress);

	const handleNavigate = () => {
		if (!canNavigate) return;
		// Build params if we have any of the identifying token fields
		const params = new URLSearchParams();
		if (token.symbol) params.set("symbol", token.symbol);
		if (token.pairAddress) params.set("pairAddress", token.pairAddress);
		if (token.tokenAddress) params.set("tokenAddress", token.tokenAddress);
		if (token.chain) params.set("chain", token.chain);
		if (token.assetType) params.set("assetType", token.assetType);
		navigate(`/perp?${params.toString()}`);
	};

	return (
		<div
			onClick={canNavigate ? handleNavigate : undefined}
			onKeyDown={
				canNavigate
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleNavigate();
							}
						}
					: undefined
			}
			role={canNavigate ? "button" : undefined}
			tabIndex={canNavigate ? 0 : undefined}
			className={`flex items-center gap-2 px-4 py-2 bg-[#001500] ${isActive ? "shadow-[0_0_8px_rgba(77,173,49,0.24)] rounded" : ""} ${canNavigate ? "cursor-pointer hover:bg-[#0b210b] transition-colors" : ""}`}
		>
			{token.logo ? (
				<img
					src={token.logo}
					alt={token.symbol}
					className="w-4 h-4 rounded-full border border-gray-800/70"
				/>
			) : (
				<div className="w-4 h-4 flex items-center justify-center text-sm">{token.logo || "🪙"}</div>
			)}
			<span className="text-[#818181] text-xs uppercase font-medium whitespace-nowrap">
				{token.symbol}
			</span>
			<svg
				className={`w-4 h-4 ${isPositive ? "text-[#4DAD31]" : "text-[#FF4C4C]"}`}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<title>{isPositive ? "Long" : "Short"}</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d={isPositive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
				/>
			</svg>
			<span className={`${isPositive ? "text-[#4DAD31]" : "text-[#FF4C4C]"} text-xs font-semibold`}>
				{changeStr}
			</span>
		</div>
	);
};

export const TopTicker: FC = () => {
	const skeletonIds = useMemo(() => Array.from({ length: 16 }).map((_, i) => `skeleton-${i}`), []);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const baseRef = useRef<HTMLDivElement | null>(null);
	const [repeat, setRepeat] = useState(2);
	// animationDuration will be applied as CSS custom property --scroll-ticker-duration
	const [animationDuration, setAnimationDuration] = useState<string>("90s");
	const location = useLocation();
	const pathname = location.pathname;
	const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

	const [{ value: tickerTokens }, fetchTickerData] = useAsyncFn(async () => {
		const result = await fetchTokensTrending({ limit: 15, page: 1 });
		if (result.data && Array.isArray(result.data)) {
			const tokens: TickerToken[] = (result.data as import("@/hooks/useTrending").TokenItem[])
				.slice(0, 15)
				.map((token) => {
					const changeRaw = token.change24h ?? 0;
					const priceChange24h =
						typeof changeRaw === "number"
							? changeRaw
							: parseFloat(String(changeRaw).replace("%", ""));
					return {
						symbol: token.symbol,
						priceChange24h,
						isLong: priceChange24h > 0,
						logo: token.logo,
						pairAddress: token.pairAddress,
						tokenAddress: token.tokenAddress,
						chain: token.chain,
						assetType: token.assetType,
					};
				});
			return tokens;
		}
		return [] as TickerToken[];
	}, []);

	useEffect(() => {
		fetchTickerData();
		const interval = setInterval(fetchTickerData, 60000);
		return () => clearInterval(interval);
	}, [fetchTickerData]);

	useEvent("resize", () => {
		// Calculate how many times we need to repeat the base set so that the
		// animated container's width is at least twice the visible container
		// width. This ensures translateX(-50%) slides exactly one copy and
		// avoids a visual jump.
		const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
		const baseWidth = baseRef.current?.scrollWidth || 0;
		const multiplier =
			baseWidth <= 0 ? 2 : Math.max(2, Math.ceil((containerWidth * 2) / baseWidth));
		setRepeat(multiplier);
		// Calculate an animation duration based on how far the animation needs to travel
		// so the perceived speed (pixels per second) is consistent across screen sizes.
		// The animation moves translateX(-50%) of the container, which equals half the
		// total container width. With 'multiplier' copies, the travel distance equals
		// (baseWidth * multiplier) / 2.
		const distancePx = (baseWidth * multiplier) / 2 || 0;
		// Choose a pixels-per-second target to achieve a comfortable speed.
		// Increase this value to make the ticker move faster, decrease to slow it.
		const pxPerSecond = 100; // 100 px / sec is a conservative default.
		const durationSeconds = Math.max(30, Math.round(distancePx / pxPerSecond));
		setAnimationDuration(`${durationSeconds}s`);
	});

	return (
		<div className="relative overflow-hidden">
			<div className="bg-neutral-700">
				{/* Hidden base container for measurement */}
				<div className="sr-only" aria-hidden>
					<div ref={baseRef} className="inline-flex items-center gap-0.5">
						{tickerTokens && tickerTokens.length > 0
							? tickerTokens.map((token, index) => (
									<TickerItem key={`base-${token.symbol}-${index}`} token={token} />
								))
							: skeletonIds.map((id) => (
									<div
										key={`base-${id}`}
										className="flex items-center gap-2 px-4 py-2 bg-[#001500]"
									>
										<Skeleton className="w-4 h-4 rounded-full" />
										<Skeleton className="h-3 w-12" />
										<Skeleton className="w-4 h-4" />
										<Skeleton className="h-3 w-16" />
									</div>
								))}
					</div>
				</div>

				<div
					ref={containerRef}
					className="inline-flex items-center gap-0.5 md:ml-4 md:mr-2 animate-scroll-ticker whitespace-nowrap"
					style={{ "--scroll-ticker-duration": animationDuration } as React.CSSProperties}
				>
					{tickerTokens && tickerTokens.length > 0
						? Array.from({ length: repeat }).flatMap((_, rep) =>
								tickerTokens.map((token, index) => (
									<TickerItem
										key={`ticker-${rep}-${token.symbol}-${index}`}
										token={token}
										isActive={
											pathname === "/perp" &&
											((!!token.pairAddress &&
												token.pairAddress.toLowerCase() ===
													(searchParams?.get("pairAddress") || "").toLowerCase()) ||
												(!!token.tokenAddress &&
													token.tokenAddress.toLowerCase() ===
														(searchParams?.get("tokenAddress") || "").toLowerCase()) ||
												token.symbol.toUpperCase() ===
													(searchParams?.get("symbol") || "").toUpperCase())
										}
									/>
								)),
							)
						: Array.from({ length: repeat }).flatMap((_, rep) =>
								skeletonIds.map((id) => (
									<div
										key={`skeleton-${rep}-${id}`}
										className="flex items-center gap-2 px-4 py-2 bg-[#001500]"
									>
										<Skeleton className="w-4 h-4 rounded-full" />
										<Skeleton className="h-3 w-12" />
										<Skeleton className="w-4 h-4" />
										<Skeleton className="h-3 w-16" />
									</div>
								)),
							)}
				</div>
			</div>
		</div>
	);
};

export default TopTicker;
