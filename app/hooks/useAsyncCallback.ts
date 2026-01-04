import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A hook that provides async callback functionality similar to react-use's useAsyncFn.
 * Returns [state, callback] where state contains { loading, error, value }.
 *
 * @param fn - The async function to wrap
 * @param deps - Dependencies array for the callback
 * @returns A tuple of [state, wrappedCallback]
 */
export function useAsyncCallback<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>,
	deps: React.DependencyList = [],
): [
	{ loading: boolean; error: Error | undefined; value: T | undefined },
	(...args: Args) => Promise<T | undefined>,
] {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [value, setValue] = useState<T | undefined>(undefined);

	// Track if component is mounted to prevent state updates after unmount
	const mountedRef = useRef(true);

	// Cleanup on unmount
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const callback = useCallback(
		async (...args: Args): Promise<T | undefined> => {
			setLoading(true);
			setError(undefined);

			try {
				const result = await fn(...args);
				if (mountedRef.current) {
					setValue(result);
					setLoading(false);
				}
				return result;
			} catch (err) {
				if (mountedRef.current) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
				return undefined;
			}
		},
		// biome-ignore lint/correctness/useExhaustiveDependencies: deps are passed by caller, intentionally not analyzed
		deps,
	);

	return [{ loading, error, value }, callback];
}

export default useAsyncCallback;
