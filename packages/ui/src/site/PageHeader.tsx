import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Page header.
 *
 * A page opens the way The Firm opens a section: a monospaced caps eyebrow, a
 * heavy serif title set straight on the field, and a rule under the whole
 * thing. There is no panel around it — framing a masthead in a box is what the
 * system this replaced did, and it is the thing that made every page look like
 * a dashboard rather than a page. `framed` now means "ruled off", which is the
 * only kind of framing left.
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
	/** Set false for dense app surfaces where the rule would crowd the page. */
	framed?: boolean;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"relative",
				framed && "border-b border-[var(--pon-line)] pb-5 md:pb-7",
				className,
			)}
		>
			<div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
				<div className="min-w-0">
					{eyebrow && <p className="firm-label mb-2 text-[var(--pon-fg-2)] md:mb-3">{eyebrow}</p>}
					<h1 className="t-h1 text-[var(--pon-fg-0)]">{title}</h1>
					{description && (
						// Clamped on phones. A four-line paragraph above the fold pushes
						// the actual content off it, and the copy is explanatory rather
						// than load-bearing — the full text is one tap away in the docs.
						<p className="t-body mt-3 line-clamp-3 max-w-[56ch] text-[var(--pon-fg-2)] md:line-clamp-none">
							{description}
						</p>
					)}
				</div>
				{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
			</div>
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
		<div className={cn("flex items-end justify-between gap-3", className)}>
			<div className="min-w-0">
				<h2 className="t-h3 text-[var(--pon-fg-0)]">{title}</h2>
				{description && <p className="mt-1 t-caption text-[var(--pon-fg-3)]">{description}</p>}
			</div>
			{actions && <div className="shrink-0">{actions}</div>}
		</div>
	);
}

/** The spaced mono caps label above a group of controls. */
export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("pon-section-label", className)}>{children}</div>;
}
