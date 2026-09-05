import { Welcome } from "@app/components/onboarding/Welcome";
import { useTour } from "@app/components/tour/TourProvider";
import { useFirstRun } from "@app/hooks/useFirstRun";
import { useCallback } from "react";
import { useLocation } from "react-router";

/**
 * The first-visit sequence: intro screens, then the walkthrough.
 *
 * Chained rather than shown together. The intro explains *what the trade is*
 * with nothing to look at yet; the tour explains *where things are* and needs
 * the board rendered underneath it. Running them at once would put a spotlight
 * on a page the reader has not been told the purpose of.
 *
 * Only ever starts on the board, which is `/vaults` rather than the site root:
 * the root is the marketing landing page, and someone still reading the pitch
 * has not asked to be walked around an app they have not entered. Landing deep
 * in the app — a shared link to one market, or a return to /portfolio — is
 * equally poor timing, and a tour whose first step lives on another route would
 * yank the page out from under whatever the person actually came for.
 */
export function FirstRun() {
	const { pathname } = useLocation();
	const { seen, markSeen } = useFirstRun("welcome");
	const tour = useTour();

	const finish = useCallback(() => {
		markSeen();
		// Straight into the walkthrough — the intro's last button promises the
		// markets, and the tour opens by pointing at them.
		tour.start();
	}, [markSeen, tour]);

	// `seen === null` means localStorage has not been read yet. Rendering the
	// intro on that would flash it at every returning visitor during hydration.
	if (seen !== false) return null;
	if (pathname !== "/vaults") return null;

	return <Welcome onDone={finish} />;
}
