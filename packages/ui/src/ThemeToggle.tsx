import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
	applyTheme,
	readPreference,
	systemTheme,
	type Theme,
	type ThemePreference,
	themeScript,
} from "./theme";
import { cn } from "./utils";

/**
 * The theme control: system, light, dark, in that order, on one button.
 *
 * A cycle rather than a switch, because there are three states and the third is
 * the default. A two-state switch would have to drop "follow the machine" the
 * moment it was touched once, which silently converts a user who never thought
 * about it into one who has opted out of their own system setting forever.
 *
 * The icon shows the *preference*, not the resulting colour — a monitor when it
 * is following the machine, a sun or a moon when it has been told. Showing the
 * resolved theme instead would draw a moon in both the "dark" and the
 * "system, and the machine is dark" cases, which are the two states a person
 * most needs to tell apart when they wonder why the site changed overnight.
 */

const ORDER: ThemePreference[] = ["system", "light", "dark"];

const LOOK: Record<ThemePreference, { icon: typeof Sun; label: string }> = {
	system: { icon: Monitor, label: "Theme: following the system" },
	light: { icon: Sun, label: "Theme: light" },
	dark: { icon: Moon, label: "Theme: dark" },
};

export function ThemeToggle({ className }: { className?: string }) {
	/**
	 * Starts as "system" on both sides of hydration, whatever is stored.
	 *
	 * The server has no way to know the answer — the preference lives in
	 * `localStorage` and the machine's setting is the browser's business — so
	 * rendering the real state on the first client pass would mismatch the markup
	 * the server sent. The page is already painted correctly by then: the inline
	 * script in `<head>` set the attribute before any of this ran, and this
	 * component only catches up with the label.
	 */
	const [preference, setPreference] = useState<ThemePreference>("system");
	const [resolved, setResolved] = useState<Theme>("light");

	useEffect(() => {
		const stored = readPreference();
		setPreference(stored);
		setResolved(stored === "system" ? systemTheme() : stored);
	}, []);

	/**
	 * Follow the machine while — and only while — nothing has been chosen.
	 *
	 * This is the half of "system" that a boolean cannot express: the setting
	 * changes at sunset, or because the OS decided, and a page left open should
	 * change with it. The listener is torn down as soon as a preference is
	 * stored, so an explicit choice is not undone by a laptop.
	 */
	useEffect(() => {
		if (preference !== "system" || typeof window === "undefined" || !window.matchMedia) return;

		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => {
			setResolved(applyTheme("system"));
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [preference]);

	function cycle() {
		const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
		setPreference(next);
		setResolved(applyTheme(next));
	}

	const look = LOOK[preference];
	const Icon = look.icon;

	return (
		<button
			type="button"
			onClick={cycle}
			// Both are read out, and they answer different questions: the label says
			// what the setting is, the title says what pressing it does. A control
			// that only announced "theme" would leave a screen-reader user cycling
			// blind through three states.
			aria-label={look.label}
			title={`${look.label}${preference === "system" ? ` (currently ${resolved})` : ""} — click to change`}
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] text-[var(--pon-fg-2)] transition-colors hover:text-[var(--pon-fg-0)]",
				className,
			)}
		>
			<Icon className="size-4" aria-hidden />
		</button>
	);
}

/**
 * The inline script tag, for the document head of an app that uses the toggle.
 *
 * Has to sit in `<head>` and ahead of the first paint — see `themeScript`. It is
 * a component rather than a documented snippet so that the two apps cannot drift
 * into shipping different versions of it.
 */
export function ThemeScript() {
	// Emitting a literal script is the entire purpose here, and its content is a
	// constant in this repo rather than anything a request can reach.
	return (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
			dangerouslySetInnerHTML={{ __html: themeScript }}
		/>
	);
}
