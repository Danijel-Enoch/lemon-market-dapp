import { useCallback, useEffect, useRef, useState } from "react";
import { searchTokens, type TokenItem } from "@app/hooks/useTrending";

// SearchResult type that matches the TokenItem from the API
export interface SearchResult {
	id: string;
	symbol: string;
	name: string;
	tokenAddress: string;
	pairAddress: string;
	priceUsd: string;
	priceChange24h: string;
	volume24h: string;
	marketCap: string;
	liquidity: string;
	dex: string;
	chain: string;
	imageUrl?: string;
	source?: string;
}

interface UseSearchOptions {
	debounceMs?: number;
	minQueryLength?: number;
	chains?: string[];
}

interface UseSearchReturn {
	results: SearchResult[];
	isLoading: boolean;
	error: string | null;
	search: (query: string) => Promise<void>;
	clearResults: () => void;
}

/**
 * Transform TokenItem from API to SearchResult for UI components
 */
function transformTokenToSearchResult(token: TokenItem): SearchResult {
	return {
		id: token.pairAddress || token.tokenAddress || String(token.id),
		symbol: token.symbol,
		name: token.name,
		tokenAddress: token.tokenAddress || "",
		pairAddress: token.pairAddress || "",
		priceUsd: token.priceUsd !== null ? String(token.priceUsd) : "0",
		priceChange24h: String(token.change24h ?? 0),
		volume24h: String(token.volume24h ?? 0),
		marketCap: token.marketCap !== null ? String(token.marketCap) : "0",
		liquidity: String(token.liquidityUsd ?? 0),
		dex: token.dexId || "unknown",
		chain: token.chain || "base",
		imageUrl: token.logo || undefined,
		source: "api",
	};
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
	const { debounceMs = 300, minQueryLength = 2 } = options;

	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const abortedRef = useRef<boolean>(false);

	const searchFn = useCallback(
		async (query: string) => {
			setIsLoading(true);
			setError(null);
			abortedRef.current = false;

			try {
				// Check minimum query length
				if (query.trim().length < minQueryLength) {
					setResults([]);
					setIsLoading(false);
					return;
				}

				// Use the new searchTokens function that auto-detects address vs symbol
				const response = await searchTokens(query.trim());

				// Check if search was cancelled
				if (abortedRef.current) {
					return;
				}

				if (response.success && response.data) {
					const transformedResults = response.data.map(transformTokenToSearchResult);
					setResults(transformedResults);
				} else {
					setResults([]);
				}
			} catch (err) {
				if (!abortedRef.current) {
					setError(err instanceof Error ? err.message : "Search failed");
					setResults([]);
				}
			} finally {
				if (!abortedRef.current) {
					setIsLoading(false);
				}
			}
		},
		[minQueryLength],
	);

	const search = useCallback(
		(query: string) => {
			// Clear previous timeout
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			// Check minimum query length for early return
			// Allow shorter queries for addresses (starting with 0x)
			const isAddressLike = query.startsWith("0x");
			if (query.trim().length < minQueryLength && !isAddressLike) {
				setResults([]);
				setError(null);
				setIsLoading(false);
				return Promise.resolve();
			}

			// For full addresses, search immediately; for shorter queries, debounce
			const isFullAddress = isAddressLike && query.length >= 40;

			return new Promise<void>((resolve) => {
				debounceTimeoutRef.current = setTimeout(
					async () => {
						await searchFn(query);
						resolve();
					},
					isFullAddress ? 0 : debounceMs,
				);
			});
		},
		[searchFn, debounceMs, minQueryLength],
	);

	const clearResults = useCallback(() => {
		setResults([]);
		setError(null);
		setIsLoading(false);
		abortedRef.current = true;

		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			abortedRef.current = true;
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	return {
		results,
		isLoading,
		error,
		search,
		clearResults,
	};
}
