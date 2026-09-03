import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Page header.
 *
 * Pons opens a page with a framed panel rather than bare text: an eyebrow in
 * lime, a display-face title, one line of supporting copy, and a radial bloom
 * in the top-right corner. Page-level actions sit opposite the title and drop
 * underneath on narrow screens.
 */
export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	framed = true,
	className,
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	/** Set false for dense app surfaces where the panel would crowd the page. */
	framed?: boolean;
	className?: string;
}) {
	const content = (
		<div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-5">
			<div className="min-w-0">
				{eyebrow && <p className="mb-2 t-eyebrow text-[var(--pon-lime)] md:mb-2.5">{eyebrow}</p>}
				<h1 className="t-h1 font-bold text-[var(--pon-fg-0)]">{title}</h1>
				{description && (
					// Clamped on phones. A four-line paragraph above the fold pushes
					// the actual content off it, and the copy is explanatory rather
					// than load-bearing — the full text is one tap away in the docs.
					<p className="mt-2 line-clamp-3 max-w-[52ch] text-[13px] leading-relaxed text-[var(--pon-fg-2)] md:mt-2.5 md:line-clamp-none md:text-[13.5px]">
						{description}
					</p>
				)}
			</div>
			{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);

	if (!framed) {
		return <header className={cn("relative", className)}>{content}</header>;
	}

	return (
		<header
			className={cn(
				"relative overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-5 py-6 md:px-[30px] md:py-[34px]",
				className,
			)}
		>
			<div aria-hidden className="pon-bloom" />
			{content}
		</header>
	);
}

/** Section heading inside a page — one step down from the page title. */
export function SubHeading({
	title,
	description,
	actions,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-start justify-between gap-3", className)}>
			<div className="min-w-0">
				<h2 className="font-display text-[17px] font-bold text-[var(--pon-fg)]">{title}</h2>
				{description && <p className="mt-1 t-caption text-[var(--pon-fg-3)]">{description}</p>}
			</div>
			{actions && <div className="shrink-0">{actions}</div>}
		</div>
	);
}

/** The spaced uppercase micro-label Pons puts above a group of controls. */
export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("pon-section-label", className)}>{children}</div>;
}
