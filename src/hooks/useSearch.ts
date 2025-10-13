import { useState, useEffect, useCallback, useRef } from "react";
import { type SearchResult } from "@/lib/search-service";

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

	const search = useCallback(
		async (query: string) => {
			// Clear previous timeout and request
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
			if (currentRequestRef.current) {
				currentRequestRef.current.abort();
			}

			// Clear previous results and error
			setError(null);

			// Check minimum query length
			if (query.trim().length < minQueryLength) {
				setResults([]);
				setIsLoading(false);
				return;
			}

			// Set loading state immediately for address searches, debounce for others
			const isAddress = query.startsWith("0x") && query.length >= 40;
			if (isAddress) {
				setIsLoading(true);
			}

			return new Promise<void>((resolve) => {
				debounceTimeoutRef.current = setTimeout(
					async () => {
						try {
							setIsLoading(true);

							// Create new abort controller for this request
							currentRequestRef.current = new AbortController();

							const params = new URLSearchParams({
								q: query.trim(),
								chains: chains.join(",")
							});

							const response = await fetch(
								`/api/search?${params.toString()}`,
								{
									signal: currentRequestRef.current.signal
								}
							);

							if (!response.ok) {
								const errorData = await response.json();
								throw new Error(
									errorData.error || `HTTP ${response.status}`
								);
							}

							const data = await response.json();

							if (data.success) {
								setResults(data.data || []);
								setError(null);
							} else {
								throw new Error(data.error || "Search failed");
							}
						} catch (err) {
							if (
								err instanceof Error &&
								err.name === "AbortError"
							) {
								// Request was aborted, don't update state
								return;
							}

							console.error("Search error:", err);
							setError(
								err instanceof Error
									? err.message
									: "Search failed"
							);
							setResults([]);
						} finally {
							setIsLoading(false);
							resolve();
						}
					},
					isAddress ? 0 : debounceMs
				);
			});
		},
		[chains, debounceMs, minQueryLength]
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
		clearResults
	};
}
