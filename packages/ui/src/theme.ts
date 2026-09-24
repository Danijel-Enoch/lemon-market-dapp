/**
 * Light and dark, decided once and written onto `<html>`.
 *
 * The whole mechanism is one attribute — `data-theme="light" | "dark"` — and
 * the stylesheet keys off nothing else. That is deliberate: a palette that
 * lived in a `prefers-color-scheme` media query *and* an override attribute is
 * two sources of truth that have to agree, and the day they disagree is the day
 * a user's explicit choice is quietly overruled by their laptop's sunset
 * schedule. So the system preference is read here, in script, and resolved into
 * the same attribute an explicit choice writes.
 *
 * Three states, not two. "system" is a real preference and the default one: it
 * means *keep following the machine*, including when the machine changes its
 * mind while the page is open. Choosing light or dark stops that following.
 * Collapsing the three into a boolean would make the first toggle a permanent
 * decision the user never knowingly made.
 */

/** What the page is actually painted as. */
export type Theme = "light" | "dark";

/** What the user asked for, which is a different question. */
export type ThemePreference = Theme | "system";

/**
 * Where the choice is kept.
 *
 * `localStorage`, not a cookie, because the server never renders a themed page:
 * the markup is identical either way and the attribute is applied before paint
 * by the script below. A cookie would buy a server-rendered theme at the cost of
 * making every response vary by it.
 */
export const THEME_STORAGE_KEY = "lemon-theme";

/** The attribute the stylesheet reads. Exported so nothing spells it twice. */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * The script that runs before the first paint.
 *
 * Inlined into `<head>`, ahead of the stylesheet's first use, because anything
 * that resolves the theme *after* paint shows the wrong one first — a lime flash
 * on a dark app, once per navigation, which is the single most visible bug a
 * theme can have.
 *
 * Written as a string of plain ES5-ish JavaScript rather than as a function this
 * module exports, because it has to execute before any bundle loads. It is
 * deliberately tiny and deliberately defensive: `localStorage` throws outright
 * in a sandboxed iframe and in Safari's lockdown mode, and a theme script that
 * throws takes the whole document's head with it.
 *
 * It sets `theme-color` as well as the attribute, which means it has to run
 * after that meta tag in the head. Leaving it to the React toggle would paint
 * the phone's own browser bar lime above a dark app until the first click —
 * on the one surface where the mismatch is most obvious.
 */
export const themeScript = `(function(){try{
var stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var theme=stored==="light"||stored==="dark"?stored:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},theme);
var meta=document.querySelector('meta[name="theme-color"]');
if(meta)meta.setAttribute("content",theme==="dark"?"#12170b":"#a3e635");
}catch(e){document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},"light");}})();`;

/** What the browser is asking for right now. Light when it cannot be asked. */
export function systemTheme(): Theme {
	if (typeof window === "undefined" || !window.matchMedia) return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The stored preference, or "system" when there is none.
 *
 * Reads storage rather than the attribute on purpose: the attribute only ever
 * holds a resolved theme, so it cannot tell "the user chose light" from "the
 * user follows a machine that is currently light" — and those differ the moment
 * the machine changes.
 */
export function readPreference(): ThemePreference {
	if (typeof window === "undefined") return "system";
	try {
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : "system";
	} catch {
		// Storage can be unavailable rather than empty — a sandboxed iframe, or a
		// browser told to block site data. Following the machine is the right
		// answer there; it is what an absent choice means anyway.
		return "system";
	}
}

/** The theme the page is painted as right now, preference resolved. */
export function resolveTheme(preference: ThemePreference = readPreference()): Theme {
	return preference === "system" ? systemTheme() : preference;
}

/**
 * Apply a preference: paint it, remember it, and tell the browser chrome.
 *
 * The `theme-color` meta is updated alongside the attribute because it is the
 * one piece of the page the CSS cannot reach — it colours the status bar on iOS
 * and the title bar on Android, and a lime bar above a dark app is exactly the
 * mismatch this whole file exists to avoid.
 */
export function applyTheme(preference: ThemePreference): Theme {
	const theme = resolveTheme(preference);
	if (typeof document === "undefined") return theme;

	document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute("content", theme === "dark" ? "#12170b" : "#a3e635");

	try {
		if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
		else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// The theme is applied either way. Failing to remember it is worth less
		// than failing to show it.
	}

	return theme;
}
