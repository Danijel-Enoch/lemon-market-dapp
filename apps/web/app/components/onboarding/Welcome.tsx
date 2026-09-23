import { ROUND_TRIP_FEE_PERCENT } from "@lemon/core";
import { Brand, Button, cn } from "@lemon/ui";
import { ArrowLeftRight, Scale, ShieldAlert, TrendingUp } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";

/**
 * First-run intro.
 *
 * Full-screen and swipeable, because on a phone this is the first thing anyone
 * sees and a dismissible banner would be scrolled past. It explains the trade
 * before the app asks for a wallet — someone who does not know what a basis is
 * cannot evaluate a board of net APYs, and a signature prompt arriving before
 * that explanation reads as a demand rather than a step.
 *
 * The last slide is deliberately the risk slide rather than a call to action.
 * An intro that only sells is the one people stop trusting the moment funding
 * flips negative.
 */

interface Slide {
	icon: typeof Scale;
	eyebrow: string;
	title: string;
	body: ReactNode;
	art: ReactNode;
}

/**
 * Two offsetting bars — the whole idea, drawn rather than described.
 *
 * Labelled by what each side *is for* rather than by its venue mechanics. "LONG
 * SPOT" beside a red "SHORT PERP" reads as a bullish bet next to a bearish one,
 * which is the single most common misreading of this product: the second side
 * is not a view on the asset, it is what cancels the first. Both bars are drawn
 * in the neutral tone for the same reason — one green and one red says somebody
 * is winning and somebody is losing, when the point is that neither happens.
 */
function LegsArt() {
	return (
		<div className="flex w-full items-end justify-center gap-3" aria-hidden>
			<div className="flex flex-1 flex-col items-center gap-2">
				<div className="h-24 w-full border border-[var(--pon-ink)] bg-[var(--pon-lime-dim)]" />
				<span className="t-micro text-[var(--pon-fg-2)]">OWN IT</span>
			</div>
			<div className="mb-7 shrink-0 rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] p-1.5">
				<ArrowLeftRight size={14} className="text-[var(--pon-fg-3)]" />
			</div>
			<div className="flex flex-1 flex-col items-center gap-2">
				<div className="h-24 w-full border border-[var(--pon-ink)] bg-[var(--pon-lime-dim)]" />
				<span className="t-micro text-[var(--pon-fg-2)]">HEDGE IT</span>
			</div>
		</div>
	);
}

/** A yield bar with its costs bitten out of it. */
function YieldArt() {
	return (
		<div className="w-full space-y-3" aria-hidden>
			<div className="space-y-1.5">
				<div className="flex justify-between t-micro text-[var(--pon-fg-3)]">
					<span>WHAT THE MARKET PAYS</span>
					<span className="text-[var(--pon-up)]">+10.95%</span>
				</div>
				<div className="h-3 w-full border border-[var(--pon-up)] bg-[var(--pon-up)]/25" />
			</div>
			<div className="space-y-1.5">
				<div className="flex justify-between t-micro text-[var(--pon-fg-3)]">
					<span>COSTS</span>
					<span className="text-[var(--pon-down)]">
						−{ROUND_TRIP_FEE_PERCENT.toFixed(2)}% + slippage
					</span>
				</div>
				<div className="h-3 w-2/5 border border-[var(--pon-down)] bg-[var(--pon-down)]/25" />
			</div>
			<div className="space-y-1.5 border-t border-[var(--pon-line)] pt-3">
				<div className="flex justify-between t-micro text-[var(--pon-fg-3)]">
					<span>WHAT YOU KEEP</span>
					<span className="font-semibold text-[var(--pon-lime)]">NET APY</span>
				</div>
				<div className="h-3 w-3/5 bg-[var(--pon-ink)]" />
			</div>
		</div>
	);
}

/** The two accounts a position spans. */
function FundingArt() {
	return (
		<div className="grid w-full grid-cols-2 gap-3" aria-hidden>
			{[
				{ label: "YOU", sub: "deposit USDC", note: "shares minted immediately" },
				{ label: "THE AGENT", sub: "runs the position", note: "every trade published" },
			].map((box) => (
				<div
					key={box.label}
					className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] p-3.5"
				>
					<p className="t-micro text-[var(--pon-fg-3)]">{box.label}</p>
					<p className="font-fono mt-1 text-[13px] font-semibold text-[var(--pon-fg)]">{box.sub}</p>
					<p className="mt-2 t-micro leading-relaxed text-[var(--pon-fg-4)]">{box.note}</p>
				</div>
			))}
		</div>
	);
}

function RiskArt() {
	return (
		<div className="w-full space-y-2" aria-hidden>
			{[
				"Withdrawals take 3–7 days",
				"Funding can turn negative",
				"A leveraged short can be liquidated",
			].map((risk) => (
				<div
					key={risk}
					className="flex items-center gap-2.5 rounded-[var(--pon-r-sm)] border border-[var(--pon-amber)] px-3.5 py-2.5"
				>
					<span className="size-1.5 shrink-0 bg-[var(--pon-amber)]" />
					<span className="text-[12.5px] text-[var(--pon-fg-2)]">{risk}</span>
				</div>
			))}
		</div>
	);
}

const SLIDES: Slide[] = [
	{
		icon: Scale,
		eyebrow: "What this is",
		title: "Owned, and hedged one for one",
		body: (
			<>
				Each vault buys a real asset on Base — NVDA, BTC — and hedges the same size against it. When
				the price moves, one side gains exactly what the other loses. You are not long, and you are
				not betting against it either.
			</>
		),
		art: <LegsArt />,
	},
	{
		icon: TrendingUp,
		eyebrow: "Where the yield comes from",
		title: "The market pays you to hold it",
		body: (
			<>
				Traders pay an hourly fee to keep a position open, and while the crowd is leaning one way,
				the hedged side is the side that gets paid. That stream, minus what it costs to get in and
				out, is the whole return — no price move required.
			</>
		),
		art: <YieldArt />,
	},
	{
		icon: ArrowLeftRight,
		eyebrow: "What you do",
		title: "Deposit USDC. That is all.",
		body: (
			<>
				You never touch either side. Deposit USDC into a vault, receive a share token immediately,
				and an agent runs it for you — buying the asset, placing the hedge, and re-hedging as they
				drift. Every move it makes is published for anyone to check.
			</>
		),
		art: <FundingArt />,
	},
	{
		icon: ShieldAlert,
		eyebrow: "Before you start",
		title: "Two things worth knowing",
		body: (
			<>
				Withdrawals take 3 to 7 days, because a real position has to be unwound to pay you. And
				taking no side is not the same as no risk: funding can turn negative, a thin market can be
				expensive to exit, and a leveraged vault's hedge can be liquidated.
			</>
		),
		art: <RiskArt />,
	},
];

export function Welcome({ onDone }: { onDone: () => void }) {
	const [index, setIndex] = useState(0);
	const touchStartX = useRef<number | null>(null);

	const last = index === SLIDES.length - 1;
	const slide = SLIDES[index];
	const Icon = slide.icon;

	const go = useCallback((next: number) => {
		setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
	}, []);

	// Horizontal swipe, the gesture this layout implies on a phone. A 48px
	// threshold keeps a slightly diagonal scroll from flipping the slide.
	function onTouchStart(event: React.TouchEvent) {
		touchStartX.current = event.touches[0]?.clientX ?? null;
	}
	function onTouchEnd(event: React.TouchEvent) {
		const start = touchStartX.current;
		const end = event.changedTouches[0]?.clientX;
		touchStartX.current = null;
		if (start === null || end === undefined) return;
		const delta = end - start;
		if (Math.abs(delta) < 48) return;
		go(delta < 0 ? index + 1 : index - 1);
	}

	return (
		<div
			className="fixed inset-0 z-[100] flex flex-col bg-[var(--pon-bg)]"
			style={{
				paddingTop: "env(safe-area-inset-top)",
				paddingBottom: "env(safe-area-inset-bottom)",
			}}
			role="dialog"
			aria-modal="true"
			aria-label="Welcome to Lemon"
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			<div className="flex items-center justify-between px-5 pt-5">
				<Brand size={24} />
				<button
					type="button"
					onClick={onDone}
					className="px-3 py-1.5 t-caption text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg)]"
				>
					Skip
				</button>
			</div>

			<div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-6 py-6">
				<div className="flex min-h-[168px] items-center justify-center rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
					{slide.art}
				</div>

				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Icon size={15} className="text-[var(--pon-lime)]" aria-hidden />
						<p className="t-eyebrow text-[var(--pon-lime)]">{slide.eyebrow}</p>
					</div>
					<h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--pon-fg-0)]">
						{slide.title}
					</h1>
					<p className="text-[14px] leading-relaxed text-[var(--pon-fg-2)]">{slide.body}</p>
				</div>
			</div>

			<div className="mx-auto w-full max-w-md space-y-4 px-6 pb-7">
				{/* Dots double as controls — on a phone they are the only affordance
				    that says how much is left. */}
				<div className="flex justify-center gap-1.5">
					{SLIDES.map((entry, dot) => (
						<button
							key={entry.title}
							type="button"
							onClick={() => go(dot)}
							aria-label={`Go to slide ${dot + 1}`}
							aria-current={dot === index}
							className={cn(
								"h-1.5 transition-all",
								dot === index
									? "w-6 bg-[var(--pon-lime)]"
									: "w-1.5 bg-[var(--pon-line-2)] hover:bg-[var(--pon-fg-4)]",
							)}
						/>
					))}
				</div>

				<div className="flex gap-2.5">
					{index > 0 && (
						<Button
							type="button"
							variant="secondary"
							size="lg"
							className="flex-1"
							onClick={() => go(index - 1)}
						>
							Back
						</Button>
					)}
					<Button
						type="button"
						size="lg"
						className="flex-1 bg-[var(--pon-lime)] font-bold text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]"
						onClick={() => (last ? onDone() : go(index + 1))}
					>
						{last ? "Show me the markets" : "Next"}
					</Button>
				</div>
			</div>
		</div>
	);
}
