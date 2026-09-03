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
		<div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
			<div className="min-w-0">
				{eyebrow && <p className="mb-2.5 t-eyebrow text-[var(--pon-lime)]">{eyebrow}</p>}
				<h1 className="t-h1 font-bold text-[var(--pon-fg-0)]">{title}</h1>
				{description && (
					<p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--pon-fg-2)]">
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
				"relative overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-[30px] py-[34px]",
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
