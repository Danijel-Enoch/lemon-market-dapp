import { cn } from "@app/lib/utils";
import {
	motion,
	useMotionValue,
	useReducedMotion,
	useScroll,
	useSpring,
	useTransform,
} from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------- smooth scroll
   A light inertial wheel handler. Native scroll stays authoritative — this only
   damps wheel deltas, so keyboard, trackpad momentum, anchor jumps and the
   scrollbar all keep working, and touch is left alone entirely. */
export function SmoothScroll() {
	useEffect(() => {
		const fine = window.matchMedia("(pointer: fine)").matches;
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (!fine || still) return;

		let target = window.scrollY;
		let frame = 0;
		let running = false;

		function stop() {
			running = false;
			cancelAnimationFrame(frame);
		}

		function tick() {
			const current = window.scrollY;
			const delta = target - current;
			if (Math.abs(delta) < 0.6) {
				window.scrollTo(0, target);
				stop();
				return;
			}
			window.scrollTo(0, current + delta * 0.12);
			frame = requestAnimationFrame(tick);
		}

		function onWheel(event: WheelEvent) {
			// Leave pinch-zoom and horizontal intent to the browser.
			if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
			event.preventDefault();
			const max = document.documentElement.scrollHeight - window.innerHeight;
			if (!running) target = window.scrollY;
			target = Math.max(0, Math.min(max, target + event.deltaY));
			if (!running) {
				running = true;
				frame = requestAnimationFrame(tick);
			}
		}

		window.addEventListener("wheel", onWheel, { passive: false });
		// Any other scroll source wins: re-sync and drop our animation.
		window.addEventListener("pointerdown", stop);
		window.addEventListener("keydown", stop);

		return () => {
			stop();
			window.removeEventListener("wheel", onWheel);
			window.removeEventListener("pointerdown", stop);
			window.removeEventListener("keydown", stop);
		};
	}, []);

	return null;
}

/* ------------------------------------------------------------ scroll progress
   A hairline that fills as the page advances — the cheapest way to make a long
   marketing page feel navigable. */
export function ScrollProgress() {
	const { scrollYProgress } = useScroll();
	const width = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });

	return (
		<motion.div
			aria-hidden
			style={{ scaleX: width }}
			className="fixed inset-x-0 top-0 z-[80] h-0.5 origin-left bg-gradient-to-r from-lime-500 to-lime-300"
		/>
	);
}

/* -------------------------------------------------------------------- reveal
   One entrance for the whole page: a short rise with a long decelerating ease,
   played once on the way in. */
export function Reveal({
	children,
	delay = 0,
	y = 28,
	className,
	trigger = "view",
}: {
	children: ReactNode;
	delay?: number;
	y?: number;
	className?: string;
	/**
	 * Above-the-fold blocks must animate on mount. Hydration replays `initial`
	 * over server-rendered markup, so anything waiting on an IntersectionObserver
	 * callback flashes empty for a frame or more before it is allowed to appear.
	 */
	trigger?: "view" | "mount";
}) {
	const still = useReducedMotion();
	const shown = { opacity: 1, y: 0 };
	if (still) return <div className={className}>{children}</div>;

	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y }}
			{...(trigger === "mount"
				? { animate: shown }
				: { whileInView: shown, viewport: { once: true, amount: 0.15 } })}
			transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
		>
			{children}
		</motion.div>
	);
}

/**
 * Headline that assembles word by word. Each word rises out of its own clipping
 * band, so the line reads as type setting itself rather than fading in.
 *
 * The viewport trigger has to sit on the unclipped parent. An IntersectionObserver
 * measures against the clip rect of every ancestor, so a word parked at y:110%
 * inside its own `overflow-hidden` band reports zero intersection — it would wait
 * forever to become visible enough to be allowed to become visible. Driving the
 * children through variants off the parent's state breaks that deadlock.
 */
export function WordReveal({
	text,
	className,
	delay = 0,
	step = 0.055,
	trigger = "view",
}: {
	text: string;
	className?: string;
	delay?: number;
	step?: number;
	trigger?: "view" | "mount";
}) {
	const still = useReducedMotion();
	const words = text.split(" ");

	if (still) return <span className={className}>{text}</span>;

	return (
		<motion.span
			className={cn("inline-block", className)}
			initial="hidden"
			{...(trigger === "mount"
				? { animate: "shown" }
				: { whileInView: "shown", viewport: { once: true, amount: 0.2 } })}
			variants={{
				hidden: {},
				shown: { transition: { delayChildren: delay, staggerChildren: step } },
			}}
		>
			{words.map((word, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed copy, positional stagger
					key={index}
					className={cn(
						"inline-block overflow-hidden pb-[0.12em] align-bottom",
						// A trailing space inside an inline-block collapses, so the gap
						// between words has to be a margin rather than a text node.
						index < words.length - 1 && "mr-[0.25em]",
					)}
				>
					<motion.span
						className="inline-block"
						variants={{
							hidden: { y: "110%" },
							shown: { y: 0, transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] } },
						}}
					>
						{word}
					</motion.span>
				</span>
			))}
		</motion.span>
	);
}

/* ------------------------------------------------------------------ parallax
   Drifts a layer against the scroll direction across its own viewport pass. */
export function Parallax({
	children,
	distance = 60,
	className,
}: {
	children: ReactNode;
	distance?: number;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const still = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "end start"],
	});
	const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

	return (
		<div ref={ref} className={className}>
			<motion.div style={still ? undefined : { y }}>{children}</motion.div>
		</div>
	);
}

/* ----------------------------------------------------------------- magnetic
   Pulls a control toward the pointer while it is nearby, then springs home. */
export function Magnetic({
	children,
	strength = 0.28,
	className,
}: {
	children: ReactNode;
	strength?: number;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const still = useReducedMotion();
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
	const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });

	if (still) return <div className={className}>{children}</div>;

	return (
		<motion.div
			ref={ref}
			className={cn("inline-block", className)}
			style={{ x: sx, y: sy }}
			onPointerMove={(event) => {
				const box = ref.current?.getBoundingClientRect();
				if (!box) return;
				x.set((event.clientX - (box.left + box.width / 2)) * strength);
				y.set((event.clientY - (box.top + box.height / 2)) * strength);
			}}
			onPointerLeave={() => {
				x.set(0);
				y.set(0);
			}}
		>
			{children}
		</motion.div>
	);
}

/* ------------------------------------------------------------------ count up
   Rolls a figure to its value the first time it scrolls into view. Formatting
   is injected so the same component serves counts, dollars and percentages. */
export function CountUp({
	value,
	format = (n) => Math.round(n).toLocaleString(),
	duration = 1400,
	className,
}: {
	value: number;
	format?: (n: number) => string;
	duration?: number;
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const still = useReducedMotion();
	const [shown, setShown] = useState(0);
	const started = useRef(false);

	useEffect(() => {
		if (still || value <= 0) {
			setShown(value);
			return;
		}
		const node = ref.current;
		if (!node) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting || started.current) return;
				started.current = true;
				observer.disconnect();

				const start = performance.now();
				const step = (now: number) => {
					const t = Math.min(1, (now - start) / duration);
					// Same decelerating curve as the reveals, so numbers land with
					// the block they belong to.
					setShown(value * (1 - (1 - t) ** 3));
					if (t < 1) requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			},
			{ threshold: 0.3 },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [value, duration, still]);

	return (
		<span ref={ref} className={className}>
			{format(shown)}
		</span>
	);
}

/* ------------------------------------------------------------------ marquee
   Duplicated track looping at -50%, so the seam never lands mid-item. */
export function Marquee({
	children,
	speed = 40,
	reverse = false,
	className,
}: {
	children: ReactNode;
	speed?: number;
	reverse?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden",
				"[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
				className,
			)}
		>
			<div
				className={cn(
					"flex w-max items-center",
					reverse ? "animate-scroll-ticker-reverse" : "animate-scroll-ticker",
				)}
				style={{ ["--scroll-ticker-duration" as string]: `${speed}s` }}
			>
				{children}
				{children}
			</div>
		</div>
	);
}

/**
 * The blurred radial bloom the reference design parks behind hero art and section headings.
 * Purely decorative, so it never takes pointer events or a11y presence.
 */
export function GlowOrb({ className, breathe = true }: { className?: string; breathe?: boolean }) {
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute rounded-full bg-lime-500/20 blur-[100px]",
				breathe && "animate-glow-breathe",
				className,
			)}
		/>
	);
}
