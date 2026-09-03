import { useCallback, useEffect, useState } from "react";

/**
 * First-run state, kept in localStorage.
 *
 * Deliberately not on the server. Whether someone has seen an intro is not
 * worth a database row or a session, and tying it to an account would mean the
 * intro cannot run before sign-in — which is exactly when it is useful.
 *
 * Every read starts as `null`, meaning "not known yet", rather than as `false`.
 * The server has no localStorage, so a `false` default would render the welcome
 * screen into the SSR output and then tear it down on hydration, flashing an
 * onboarding overlay at every returning user. Callers wait for a concrete
 * boolean instead.
 */

const KEYS = {
	welcome: "lemon.welcome.seen.v1",
	tour: "lemon.tour.done.v1",
} as const;

export type FirstRunFlag = keyof typeof KEYS;

function read(flag: FirstRunFlag): boolean {
	try {
		return window.localStorage.getItem(KEYS[flag]) === "1";
	} catch {
		// Private browsing and blocked storage both throw. Treating that as
		// "already seen" is the kinder failure: an intro that cannot remember
		// being dismissed would reappear on every navigation.
		return true;
	}
}

function write(flag: FirstRunFlag, value: boolean): void {
	try {
		if (value) window.localStorage.setItem(KEYS[flag], "1");
		else window.localStorage.removeItem(KEYS[flag]);
	} catch {
		// Nothing to do — the flag simply will not persist.
	}
}

export function useFirstRun(flag: FirstRunFlag) {
	const [seen, setSeen] = useState<boolean | null>(null);

	useEffect(() => setSeen(read(flag)), [flag]);

	const markSeen = useCallback(() => {
		write(flag, true);
		setSeen(true);
	}, [flag]);

	const reset = useCallback(() => {
		write(flag, false);
		setSeen(false);
	}, [flag]);

	return { seen, markSeen, reset };
}

/** True once the viewport is phone-sized, or null before it can be measured. */
export function useIsMobile(breakpoint = 768): boolean | null {
	const [isMobile, setIsMobile] = useState<boolean | null>(null);

	useEffect(() => {
		const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
		const sync = () => setIsMobile(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, [breakpoint]);

	return isMobile;
}
