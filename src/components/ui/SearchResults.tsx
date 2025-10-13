"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Loader2,
	ArrowUpRight,
	ArrowDownRight,
	ExternalLink
} from "lucide-react";
import { TokenImage } from "@/components/ui/TokenImage";
import { type SearchResult } from "@/lib/search-service";

interface SearchResultsProps {
	results: SearchResult[];
	isLoading: boolean;
	error: string | null;
	query: string;
	onTradeClick: (result: SearchResult) => void;
}

export function SearchResults({
	results,
	isLoading,
	error,
	query,
	onTradeClick
}: SearchResultsProps) {
	const formatPrice = (price: string) => {
		const num = parseFloat(price);
		if (num === 0) return "$0.00";
		if (num < 0.01) return `$${num.toFixed(6)}`;
		if (num < 1) return `$${num.toFixed(4)}`;
		return `$${num.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})}`;
	};

	const formatVolume = (volume: string) => {
		const num = parseFloat(volume);
		if (num === 0) return "$0";
		if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
		if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
		if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
		return `$${num.toFixed(0)}`;
	};

	const formatChange = (change: string) => {
		const num = parseFloat(change);
		if (num === 0) return "0.00%";
		return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
	};

	const getChangeColor = (change: string) => {
		const num = parseFloat(change);
		if (num > 0) return "text-green-400";
		if (num < 0) return "text-red-400";
		return "text-gray-400";
	};

	const getChainBadgeColor = (chain: string) => {
		switch (chain.toLowerCase()) {
			case "base":
				return "bg-blue-600/20 text-blue-400 border-blue-600/30";
			case "ethereum":
			case "eth":
				return "bg-blue-500/20 text-blue-400 border-blue-500/30";
			case "bsc":
			case "binance":
				return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
			case "polygon":
			case "matic":
				return "bg-purple-500/20 text-purple-400 border-purple-500/30";
			default:
				return "bg-gray-500/20 text-gray-400 border-gray-500/30";
		}
	};

	if (isLoading) {
		return (
			<Card className="border-gray-100/10">
				<CardContent className="flex items-center justify-center py-8">
					<div className="flex items-center gap-3 text-muted-foreground">
						<Loader2 className="w-5 h-5 animate-spin" />
						<span>Searching across multiple exchanges...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className="border-gray-100/10">
				<CardContent className="py-8">
					<div className="text-center">
						<p className="text-red-400 mb-2">Search Error</p>
						<p className="text-muted-foreground text-sm">{error}</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (results.length === 0 && query.length >= 2) {
		return (
			<Card className="border-gray-100/10">
				<CardContent className="py-8">
					<div className="text-center text-muted-foreground">
						<p className="mb-2">No results found for "{query}"</p>
						<p className="text-sm">Try searching by:</p>
						<ul className="text-sm mt-2 space-y-1">
							<li>• Token symbol (e.g., "BTC", "ETH")</li>
							<li>• Token name (e.g., "Bitcoin", "Ethereum")</li>
							<li>• Contract address (0x...)</li>
							<li>• Pair address (0x...)</li>
						</ul>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (results.length === 0) {
		return null;
	}

	return (
		<Card className="border-gray-100/10">
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-gray-100/10 bg-muted/30">
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Token
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Price
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									24h Change
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Volume 24h
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Liquidity
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Exchange/Chain
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{results.map((result, index) => (
								<tr
									key={`${result.id}-${index}`}
									className="border-b border-gray-100/5 hover:bg-muted/20 transition-colors"
								>
									<td className="p-3">
										<div className="flex items-center gap-3">
											<TokenImage
												src={result.imageUrl}
												symbol={result.symbol}
												size={32}
											/>
											<div>
												<div className="font-medium text-foreground">
													{result.symbol}
												</div>
												<div className="text-xs text-muted-foreground truncate max-w-[120px]">
													{result.name}
												</div>
											</div>
										</div>
									</td>

									<td className="p-3">
										<div className="font-medium text-foreground">
											{formatPrice(result.priceUsd)}
										</div>
									</td>

									<td className="p-3">
										<div
											className={`flex items-center gap-1 ${getChangeColor(
												result.priceChange24h
											)}`}
										>
											{parseFloat(result.priceChange24h) >
											0 ? (
												<ArrowUpRight className="w-3 h-3" />
											) : parseFloat(
													result.priceChange24h
											  ) < 0 ? (
												<ArrowDownRight className="w-3 h-3" />
											) : null}
											{formatChange(
												result.priceChange24h
											)}
										</div>
									</td>

									<td className="p-3 text-muted-foreground">
										{formatVolume(result.volume24h)}
									</td>

									<td className="p-3 text-muted-foreground">
										{formatVolume(result.liquidity)}
									</td>

									<td className="p-3">
										<div className="flex flex-col gap-1">
											<Badge
												variant="outline"
												className={`text-xs w-fit ${getChainBadgeColor(
													result.chain
												)}`}
											>
												{result.chain.toUpperCase()}
											</Badge>
											<div className="text-xs text-muted-foreground capitalize">
												{result.dex}
											</div>
										</div>
									</td>

									<td className="p-3">
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												onClick={() =>
													onTradeClick(result)
												}
												className="bg-primary hover:bg-primary/90 text-black font-medium"
											>
												Trade
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													window.open(
														`https://dexscreener.com/${result.chain}/${result.pairAddress}`,
														"_blank"
													)
												}
												className="p-2"
											>
												<ExternalLink className="w-3 h-3" />
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{results.length > 0 && (
					<div className="p-3 border-t border-gray-100/10 bg-muted/10">
						<div className="text-xs text-muted-foreground text-center">
							Found {results.length} results on Base network from
							DexScreener and GeckoTerminal
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
