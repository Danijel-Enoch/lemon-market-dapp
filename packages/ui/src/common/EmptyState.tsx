import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Empty panel.
 *
 * Pons keeps an empty on the same well surface as the content it replaces, with
 * a dashed hairline — the one place in the system that dashes a border, because
 * it is the only place where the frame means "nothing here yet" rather than
 * "this is a thing".
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
				"flex flex-col items-center gap-3 rounded-[var(--pon-r-lg)] border border-dashed border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-6 py-12 text-center",
				className,
			)}
		>
			{Icon && <Icon size={22} className="text-[var(--pon-fg-3)]" aria-hidden />}
			<p className="text-[15px] font-semibold text-[var(--pon-fg)]">{title}</p>
			{children && (
				<div className="max-w-md text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
					{children}
				</div>
			)}
			{action && <div className="mt-1">{action}</div>}
		</div>
	);
}
