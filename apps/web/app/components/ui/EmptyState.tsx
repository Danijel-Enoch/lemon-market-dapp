import { cn } from "@app/lib/utils";
import { Inbox } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

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
			<div className="mb-4 flex size-12 items-center justify-center rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
				<Icon className="size-5 text-[var(--pon-fg-3)]" />
			</div>
			<h3 className="text-[15px] font-semibold text-[var(--pon-fg)]">{title}</h3>
			{description && (
				<p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
					{description}
				</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
