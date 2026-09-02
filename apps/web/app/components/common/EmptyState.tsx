import { cn } from "@app/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Empty panel.
 *
 * Avantis keeps empties on the same flat surface as the content they replace,
 * with a hairline rather than a dashed outline, so a table that has no rows
 * still reads as part of the page rather than as a dropped-out placeholder.
 */
export function EmptyPanel({
	icon: Icon,
	title,
	children,
	action,
	className,
}: {
	icon?: LucideIcon;
	title: string;
	children?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-3)] px-6 py-12 text-center",
				className,
			)}
		>
			{Icon && <Icon size={24} className="text-[var(--ink-2)] opacity-60" aria-hidden />}
			<p className="t-body font-medium text-[var(--ink-1)]">{title}</p>
			{children && <div className="max-w-md t-label text-[var(--ink-2)]">{children}</div>}
			{action && <div className="mt-1">{action}</div>}
		</div>
	);
}
