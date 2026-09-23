import { Inbox } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "../utils";

interface EmptyStateProps {
	/** Icon component to display (defaults to Inbox) */
	icon?: ComponentType<{ className?: string }>;
	/** Main title text */
	title: string;
	/** Optional description text */
	description?: string;
	/** Optional action button or link */
	action?: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Inline empty state — the borderless form, for when the surrounding card is
 * already the frame. Pons marks the icon with a filled circle on the well
 * surface rather than leaving it floating.
 */
export function EmptyState({
	icon: Icon = Inbox,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div className={cn("flex flex-col items-center justify-center py-10 text-center", className)}>
			<div className="mb-4 flex size-11 items-center justify-center rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-lime-dim)]">
				<Icon className="size-5 text-[var(--pon-fg-3)]" />
			</div>
			<h3 className="t-h3 text-[var(--pon-fg-0)]">{title}</h3>
			{description && <p className="mt-2 max-w-md t-body text-[var(--pon-fg-2)]">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
