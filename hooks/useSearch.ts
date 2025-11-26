import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/search-service";

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

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
	const { debounceMs = 300, minQueryLength = 2, chains = ["base"] } = options;

	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const currentRequestRef = useRef<AbortController | undefined>(undefined);

	const searchFn = useCallback(
		async (query: string) => {
			setIsLoading(true);
			setError(null);

			try {
				// Clear previous request
				if (currentRequestRef.current) {
					currentRequestRef.current.abort();
				}

				// Check minimum query length
				if (query.trim().length < minQueryLength) {
					setResults([]);
					setIsLoading(false);
					return;
				}

				// Create new abort controller for this request
				currentRequestRef.current = new AbortController();

				const params = new URLSearchParams({
					q: query.trim(),
					chains: chains.join(","),
				});

				const response = await fetch(`/api/search?${params.toString()}`, {
					signal: currentRequestRef.current.signal,
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || `HTTP ${response.status}`);
				}

				const data = await response.json();

				if (data.success) {
					setResults(data.data || []);
				} else {
					throw new Error(data.error || "Search failed");
				}
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					setError(err.message);
					setResults([]);
				}
			} finally {
				setIsLoading(false);
			}
		},
		[chains, minQueryLength],
	);

	const search = useCallback(
		(query: string) => {
			// Clear previous timeout
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			// Check minimum query length for early return
			if (query.trim().length < minQueryLength) {
				setResults([]);
				setError(null);
				setIsLoading(false);
				return Promise.resolve();
			}

			// Set loading state immediately for address searches, debounce for others
			const isAddress = query.startsWith("0x") && query.length >= 40;

			return new Promise<void>((resolve) => {
				debounceTimeoutRef.current = setTimeout(
					async () => {
						await searchFn(query);
						resolve();
					},
					isAddress ? 0 : debounceMs,
				);
			});
		},
		[searchFn, debounceMs, minQueryLength],
	);

	const clearResults = useCallback(() => {
		setResults([]);
		setError(null);
		setIsLoading(false);

		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}
		if (currentRequestRef.current) {
			currentRequestRef.current.abort();
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
			if (currentRequestRef.current) {
				currentRequestRef.current.abort();
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
