import { TOUR_STEPS, type TourStep } from "@app/components/tour/steps";
import { useFirstRun } from "@app/hooks/useFirstRun";
import { cn } from "@lemon/ui";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Guided walkthrough.
 *
 * A spotlight cut out of a dimmed overlay, plus a card explaining the element
 * underneath it. The cut-out is a `box-shadow` spread rather than an SVG mask
 * or four edge divs: one element, no seams between panels, and it animates
 * cleanly when the target changes.
 *
 * The hard part is not the drawing, it is that steps span routes. Advancing to
 * a step on another page navigates first and then waits for the target to
 * mount, because the element does not exist at the moment the step becomes
 * current — and measuring a missing element would place the card at the
 * top-left corner over nothing.
 */

interface TourApi {
	start: () => void;
	stop: () => void;
	isRunning: boolean;
	/** True once we know whether the tour has been completed before. */
	ready: boolean;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
	const context = useContext(TourContext);
	if (!context) throw new Error("useTour must be used inside <TourProvider>");
	return context;
}

interface Rect {
	top: number;
	left: number;
	width: number;
	height: number;
}

function selectorFor(step: TourStep): string {
	return `[data-tour="${step.target}"]`;
}

/**
 * The next index, or null at the end.
 *
 * Null rather than a number past the last step: the overlay renders on `step`,
 * so an out-of-range index unmounts the card while `isRunning` stays true on a
 * non-null index — a dimmed, scroll-locked page with nothing left to dismiss.
 */
function nextIndex(value: number | null): number | null {
	if (value === null) return null;
	return value + 1 < TOUR_STEPS.length ? value + 1 : null;
}

/** Does this step's route match where we are? `:id` matches any single segment. */
function pathMatches(pattern: string, pathname: string): boolean {
	if (pattern === pathname) return true;
	const expected = pattern.split("/").filter(Boolean);
	const actual = pathname.split("/").filter(Boolean);
	if (expected.length !== actual.length) return false;
	return expected.every((part, index) => part.startsWith(":") || part === actual[index]);
}

/**
 * The first *visible* match for a selector.
 *
 * Not `querySelector`. Several targets are rendered twice — the portfolio link
 * exists in both the desktop nav and the mobile tab bar, and only one of them
 * is displayed at any width. Taking the first match in document order would
 * spotlight the hidden one, which measures as a zero-size box somewhere near
 * the top of the page.
 */
function findVisible(selector: string): HTMLElement | null {
	for (const element of document.querySelectorAll<HTMLElement>(selector)) {
		const rect = element.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) return element;
	}
	return null;
}

/**
 * Wait for a target to exist and have a box worth pointing at.
 *
 * Polls on animation frames rather than using a MutationObserver: the element
 * often exists before it has been laid out (a card inside a route that is still
 * measuring), and "present in the DOM" is not the condition we need — "has a
 * rect we can point at" is.
 */
function waitForElement(selector: string, timeoutMs = 4000): Promise<HTMLElement | null> {
	return new Promise((resolve) => {
		const started = performance.now();
		function poll() {
			const element = findVisible(selector);
			if (element) return resolve(element);
			if (performance.now() - started > timeoutMs) return resolve(null);
			requestAnimationFrame(poll);
		}
		poll();
	});
}

export function TourProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { seen, markSeen, reset } = useFirstRun("tour");

	const [index, setIndex] = useState<number | null>(null);
	const [rect, setRect] = useState<Rect | null>(null);
	const cancelled = useRef(false);

	const isRunning = index !== null;
	const step = index === null ? null : TOUR_STEPS[index];

	const stop = useCallback(() => {
		cancelled.current = true;
		setIndex(null);
		setRect(null);
		markSeen();
	}, [markSeen]);

	const start = useCallback(() => {
		cancelled.current = false;
		reset();
		setRect(null);
		setIndex(0);
	}, [reset]);

	/**
	 * Advance, or end the tour and mark it seen.
	 *
	 * Every path that moves forward goes through this — the button, the arrow
	 * key, the backdrop, and a step whose target never showed. Defined above the
	 * effect that calls it so it can be a dependency of one.
	 */
	const next = useCallback(() => {
		setRect(null);
		setIndex((value) => {
			const target = nextIndex(value);
			if (target === null && value !== null) markSeen();
			return target;
		});
	}, [markSeen]);

	// Resolve the current step: navigate if needed, wait for the target, then
	// scroll it into view and measure. Skips forward when a target never shows.
	useEffect(() => {
		if (index === null) return;
		const current = TOUR_STEPS[index];
		if (!current) return;

		let stale = false;

		async function resolve() {
			if (!pathMatches(current.path, window.location.pathname)) {
				// ":id" cannot be navigated to literally — substitute the first
				// vault the board is showing, which is what the previous step
				// just pointed the user at. Read off the row's own link rather
				// than a stored address, so it follows whatever the active
				// filters left on screen.
				const concrete = current.path.includes(":id")
					? (findVisible('[data-tour="vault-link"]')?.getAttribute("href") ?? null)
					: current.path;
				if (!concrete) {
					// No vault to visit — this deployment has none, or a filter
					// emptied the board. Skip, and end cleanly if that was last.
					if (!stale) next();
					return;
				}
				navigate(concrete);
			}

			const element = await waitForElement(selectorFor(current));
			if (stale || cancelled.current) return;

			if (!element) {
				// A missing target is a skip, never a deadlock.
				next();
				return;
			}

			element.scrollIntoView({ block: "center", behavior: "smooth" });
			// Let the smooth scroll settle before measuring, or the spotlight
			// lands where the element was rather than where it stopped.
			await new Promise((done) => setTimeout(done, 380));
			if (stale || cancelled.current) return;

			const box = element.getBoundingClientRect();
			setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
		}

		void resolve();
		return () => {
			stale = true;
		};
	}, [index, navigate, next]);

	// Keep the spotlight on the element while the page moves under it.
	useEffect(() => {
		if (!isRunning || !step) return;

		function remeasure() {
			const element = findVisible(selectorFor(step as TourStep));
			if (!element) return;
			const box = element.getBoundingClientRect();
			setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
		}

		window.addEventListener("resize", remeasure);
		window.addEventListener("scroll", remeasure, true);
		return () => {
			window.removeEventListener("resize", remeasure);
			window.removeEventListener("scroll", remeasure, true);
		};
	}, [isRunning, step]);

	// Escape ends it, like any other overlay.
	useEffect(() => {
		if (!isRunning) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") stop();
			if (event.key === "ArrowRight") next();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isRunning, stop, next]);

	// The page behind a spotlight must not scroll out from under it.
	useEffect(() => {
		if (!isRunning) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [isRunning]);

	const back = useCallback(() => {
		setIndex((value) => {
			if (value === null || value === 0) return value;
			setRect(null);
			return value - 1;
		});
	}, []);

	const api = useMemo<TourApi>(
		() => ({ start, stop, isRunning, ready: seen !== null }),
		[start, stop, isRunning, seen],
	);

	return (
		<TourContext.Provider value={api}>
			{children}
			{isRunning && step && (
				<TourOverlay
					step={step}
					rect={rect}
					index={index as number}
					total={TOUR_STEPS.length}
					onNext={next}
					onBack={back}
					onSkip={stop}
				/>
			)}
			{/* Keeps `pathname` a dependency of nothing while still re-rendering the
			    provider on navigation, so a step that changes route re-measures. */}
			<span hidden aria-hidden data-tour-path={pathname} />
		</TourContext.Provider>
	);
}

const CARD_WIDTH = 320;
const GAP = 14;
/** Breathing room between the card and the edge of the screen. */
const MARGIN = 12;

function TourOverlay({
	step,
	rect,
	index,
	total,
	onNext,
	onBack,
	onSkip,
}: {
	step: TourStep;
	rect: Rect | null;
	index: number;
	total: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}) {
	const cardRef = useRef<HTMLDivElement>(null);
	// The card's height is content-dependent — step copy runs from two lines to
	// six — so it is measured rather than assumed. A guessed height is what puts
	// the card on top of the very element it is describing.
	const [cardHeight, setCardHeight] = useState(200);

	useEffect(() => {
		const element = cardRef.current;
		if (!element) return;
		// `contentRect` excludes padding, and the card has 16px of it on every
		// side — measuring that instead of the border box under-reports the
		// height by 32px, which is exactly enough to push the card off the bottom
		// of a phone screen while the clamp believes it fits.
		const observer = new ResizeObserver(() => {
			setCardHeight(element.getBoundingClientRect().height);
		});
		observer.observe(element);
		setCardHeight(element.getBoundingClientRect().height);
		return () => observer.disconnect();
	}, []);

	const pad = step.padding ?? 8;

	// Until the target is measured, dim the screen but draw no hole — a hole at
	// 0,0 reads as a spotlight on the wrong element rather than as loading.
	const hole = rect
		? {
				top: rect.top - pad,
				left: rect.left - pad,
				width: rect.width + pad * 2,
				height: rect.height + pad * 2,
			}
		: null;

	const viewportWidth = typeof window === "undefined" ? 390 : window.innerWidth;
	const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
	const cardWidth = Math.min(CARD_WIDTH, viewportWidth - MARGIN * 2);

	let cardTop = viewportHeight / 2 - cardHeight / 2;
	let cardLeft = (viewportWidth - cardWidth) / 2;

	if (hole) {
		const spaceAbove = hole.top - GAP - MARGIN;
		const spaceBelow = viewportHeight - (hole.top + hole.height) - GAP - MARGIN;
		const fitsAbove = spaceAbove >= cardHeight;
		const fitsBelow = spaceBelow >= cardHeight;
		// Set only when the card ends up beside the target rather than over or
		// under it, in which case it stops being horizontally centred on the hole.
		let besideLeft: number | null = null;

		if (step.placement === "top" && fitsAbove) {
			cardTop = hole.top - GAP - cardHeight;
		} else if (fitsBelow) {
			cardTop = hole.top + hole.height + GAP;
		} else if (fitsAbove) {
			cardTop = hole.top - GAP - cardHeight;
		} else {
			// Neither above nor below can hold it. Try beside it before giving up:
			// the deposit panel is a sidebar that runs nearly the full height of
			// the page, so it has no vertical room and a wide column of free space
			// to one side. Pinning to a vertical edge here would lay the card over
			// the panel it is describing.
			const spaceLeft = hole.left - GAP - MARGIN;
			const spaceRight = viewportWidth - (hole.left + hole.width) - GAP - MARGIN;
			if (spaceLeft >= cardWidth) {
				besideLeft = hole.left - GAP - cardWidth;
			} else if (spaceRight >= cardWidth) {
				besideLeft = hole.left + hole.width + GAP;
			}

			cardTop =
				besideLeft !== null
					? hole.top + hole.height / 2 - cardHeight / 2
					: // Nowhere to go — a tall target on a phone. Pin to the edge
						// furthest from the target so the spotlight stays visible,
						// rather than centring the card over the middle of it.
						hole.top + hole.height / 2 < viewportHeight / 2
						? viewportHeight - cardHeight - MARGIN
						: MARGIN;
		}

		cardTop = Math.max(MARGIN, Math.min(cardTop, viewportHeight - cardHeight - MARGIN));
		cardLeft = besideLeft ?? hole.left + hole.width / 2 - cardWidth / 2;
		cardLeft = Math.max(MARGIN, Math.min(cardLeft, viewportWidth - cardWidth - MARGIN));
	}

	return (
		<div
			className="fixed inset-0 z-[95]"
			role="dialog"
			aria-modal="true"
			aria-label="App walkthrough"
		>
			{/* The dim layer. With a hole, it is the hole's own huge shadow; without
			    one, a plain scrim. */}
			{hole ? (
				<div
					className="pointer-events-none absolute rounded-[var(--pon-r-md)] ring-2 ring-[var(--pon-lime)] transition-all duration-300"
					style={{
						top: hole.top,
						left: hole.left,
						width: hole.width,
						height: hole.height,
						boxShadow: "0 0 0 9999px rgba(0,0,0,0.76)",
					}}
				/>
			) : (
				<div className="absolute inset-0 bg-black/76" />
			)}

			{/* Tapping the dimmed area advances, the way a coach mark should. */}
			<button
				type="button"
				aria-label="Next step"
				tabIndex={-1}
				className="absolute inset-0 cursor-default"
				onClick={onNext}
			/>

			<div
				ref={cardRef}
				className="absolute rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4 shadow-2xl transition-all duration-300"
				style={{ top: cardTop, left: cardLeft, width: cardWidth }}
			>
				<div className="mb-2 flex items-center justify-between">
					<span className="font-fono t-micro text-[var(--pon-lime)]">
						{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
					</span>
					<button
						type="button"
						onClick={onSkip}
						className="t-micro text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg)]"
					>
						Skip tour
					</button>
				</div>

				<h2 className="font-display text-[15px] font-bold text-[var(--pon-fg)]">{step.title}</h2>
				<p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">{step.body}</p>

				<div className="mt-4 flex items-center gap-2">
					<div className="flex flex-1 gap-1" aria-hidden>
						{Array.from({ length: total }, (_, dot) => (
							<span
								key={`${step.target}-dot-${dot}`}
								className={cn(
									"h-1 flex-1 rounded-full transition-colors",
									dot <= index ? "bg-[var(--pon-lime)]" : "bg-[var(--pon-line-2)]",
								)}
							/>
						))}
					</div>
					{index > 0 && (
						<button
							type="button"
							onClick={onBack}
							className="rounded-full border border-[var(--pon-line-2)] px-3 py-1.5 t-caption text-[var(--pon-fg-2)] transition-colors hover:border-[var(--pon-fg-3)]"
						>
							Back
						</button>
					)}
					<button
						type="button"
						onClick={onNext}
						className="rounded-full bg-[var(--pon-lime)] px-4 py-1.5 t-caption font-bold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
					>
						{index + 1 === total ? "Done" : "Next"}
					</button>
				</div>
			</div>
		</div>
	);
}
