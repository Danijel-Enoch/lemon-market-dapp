"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";
import { useAsyncFn } from "react-use";
import { Skeleton } from "@/components/ui/skeleton";
import type { FC } from "react";

interface TickerToken {
	symbol: string;
	priceChange24h: number;
	isLong: boolean;
	logo?: string;
}

const TickerItem: FC<{ token: TickerToken }> = ({ token }) => {
	const isPositive = token.priceChange24h > 0;
	const changeStr = `${isPositive ? "+" : ""}${token.priceChange24h.toFixed(2)}%`;

	return (
		<div className="flex items-center gap-2 px-4 py-2 bg-[#001500]">
			{token.logo ? (
				<Image
					src={token.logo}
					alt={token.symbol}
					width={16}
					height={16}
					className="rounded-full border border-gray-800/70"
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
	const [{ value: tickerTokens }, fetchTickerData] = useAsyncFn(async () => {
		const response = await fetch("/api/trending/tokens");
		const result = await response.json();

		if (result.data && Array.isArray(result.data)) {
			const tokens: TickerToken[] = result.data
				.slice(0, 15)
				.map((token: { symbol: string; change24h?: string; logo?: string }) => {
					const priceChange24h = token.change24h ? parseFloat(token.change24h.replace("%", "")) : 0;
					return {
						symbol: token.symbol,
						priceChange24h,
						isLong: priceChange24h > 0,
						logo: token.logo,
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

	return (
		<div className="relative overflow-hidden">
			<div className="bg-neutral-700">
				<div className="flex gap-0.5 animate-scroll-ticker">
					{tickerTokens && tickerTokens.length > 0 ? (
						<>
							{tickerTokens.map((token, index) => (
								<TickerItem key={`${token.symbol}-${index}`} token={token} />
							))}
							{tickerTokens.map((token, index) => (
								<TickerItem key={`${token.symbol}-dup-${index}`} token={token} />
							))}
						</>
					) : (
						<div className="flex items-center gap-0.5">
							{skeletonIds.map((id) => (
								<div key={id} className="flex items-center gap-2 px-4 py-2 bg-[#001500]">
									<Skeleton className="w-4 h-4 rounded-full" />
									<Skeleton className="h-3 w-12" />
									<Skeleton className="w-4 h-4" />
									<Skeleton className="h-3 w-16" />
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default TopTicker;
