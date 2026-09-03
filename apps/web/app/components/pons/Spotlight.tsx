import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Spotlight banner.
 *
 * Pons' "crowned" treatment: a lime hairline over a diagonal tint that fades
 * into the page, with a radial bloom in the top-right corner and a solid lime
 * tile holding the mark. It is the one component allowed to raise its voice, so
 * a page gets at most one.
 */
export function Spotlight({
	mark,
	title,
	subtitle,
	tag,
	value,
	valueMeta,
	tone = "positive",
	action,
	className,
}: {
	mark?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	tag?: ReactNode;
	value?: ReactNode;
	valueMeta?: ReactNode;
	tone?: "positive" | "negative" | "neutral";
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative flex flex-wrap items-center gap-4 overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-lime)] p-5",
				className,
			)}
			style={{
				background: "linear-gradient(120deg, var(--pon-lime-dim), var(--pon-bg-2) 60%)",
			}}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background: "radial-gradient(300px 140px at 100% 0%, var(--pon-glow), transparent 70%)",
				}}
			/>

			{mark && (
				<span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[var(--pon-lime)] text-[32px]">
					{mark}
				</span>
			)}

			<div className="relative min-w-[180px] flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-display text-lg font-bold text-[var(--pon-fg)]">{title}</span>
					{subtitle && <span className="t-micro text-[var(--pon-fg-3)]">{subtitle}</span>}
					{tag}
				</div>
			</div>

			{(value || valueMeta) && (
				<div className="relative text-right">
					{value && (
						<div className="font-fono text-[22px] font-bold text-[var(--pon-fg)]">{value}</div>
					)}
					{valueMeta && (
						<div
							className={cn(
								"t-caption font-semibold",
								tone === "positive" && "text-[var(--pon-up)]",
								tone === "negative" && "text-[var(--pon-down)]",
								tone === "neutral" && "text-[var(--pon-fg-3)]",
							)}
						>
							{valueMeta}
						</div>
					)}
				</div>
			)}

			{action && <div className="relative shrink-0">{action}</div>}
		</div>
	);
}

/**
 * Accent panel — the quieter sibling: a lime hairline over a tint that fades
 * downward. Pons uses it to fence off a section that matters without giving it
 * the full spotlight bloom.
 */
export function AccentPanel({
	title,
	meta,
	description,
	children,
	className,
}: {
	title?: ReactNode;
	meta?: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("pon-accent-frame p-[18px]", className)}>
			{(title || description) && (
				<header className="mb-3.5">
					{title && (
						<div className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-[var(--pon-fg)]">
							{title}
							{meta}
						</div>
					)}
					{description && <p className="mt-1 t-caption text-[var(--pon-fg-2)]">{description}</p>}
				</header>
			)}
			{children}
		</section>
	);
}
