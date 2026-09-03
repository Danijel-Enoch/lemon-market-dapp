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
 * Only ever starts on the board. Landing deep in the app — a shared link to one
 * market, or a return to /accounts — is a poor moment to be handed a four-slide
 * primer, and a tour whose first step lives on another route would yank the
 * page out from under whatever the person actually came for.
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
	if (pathname !== "/") return null;

	return <Welcome onDone={finish} />;
}
