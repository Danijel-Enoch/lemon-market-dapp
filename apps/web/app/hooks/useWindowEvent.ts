import { useEffect } from "react";

/**
 * A hook that adds an event listener to the window object.
 * Replaces react-use's useEvent hook for window events.
 *
 * @param eventName - The event name to listen for (e.g., 'resize', 'scroll')
 * @param handler - The event handler function
 * @param options - Optional AddEventListenerOptions
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
	eventName: K,
	handler: (event: WindowEventMap[K]) => void,
	options?: boolean | AddEventListenerOptions,
): void {
	useEffect(() => {
		if (typeof window === "undefined") return;

		window.addEventListener(eventName, handler, options);

		return () => {
			window.removeEventListener(eventName, handler, options);
		};
	}, [eventName, handler, options]);
}

export default useWindowEvent;
