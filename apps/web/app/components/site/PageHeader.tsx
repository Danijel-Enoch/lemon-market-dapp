import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * App-surface page header.
 *
 * Avantis opens every in-app page the same way: a 30px title, one line of grey
 * supporting copy under it, and any page-level actions pinned to the right on
 * wide screens. Below md the actions drop underneath.
 */
export function PageHeader({
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
		<header
			className={cn("flex flex-col gap-4 md:flex-row md:items-start md:justify-between", className)}
		>
			<div className="space-y-2">
				<h1 className="t-h2 font-medium text-white">{title}</h1>
				{description && (
					<p className="max-w-2xl t-label leading-relaxed text-[var(--ink-2)]">{description}</p>
				)}
			</div>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</header>
	);
}

/** Section heading inside an app page — one step down from the page title. */
export function SubHeading({
	title,
	actions,
	className,
}: {
	title: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-center justify-between gap-3", className)}>
			<h2 className="t-body-lg font-medium text-[var(--ink-1)]">{title}</h2>
			{actions}
		</div>
	);
}
