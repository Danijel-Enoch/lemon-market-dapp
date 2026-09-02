import { cn } from "@app/lib/utils";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "warning" | "danger";

/**
 * Notice block.
 *
 * Avantis carries tone on a left rule and the icon rather than by tinting the
 * whole panel, so a warning sits at the same visual weight as the surfaces
 * around it and only the accent changes.
 */
const TONES: Record<Tone, { rule: string; icon: typeof Info; iconClass: string }> = {
	info: { rule: "border-l-lime-400", icon: Info, iconClass: "text-lime-400" },
	warning: { rule: "border-l-amber-400", icon: AlertTriangle, iconClass: "text-amber-400" },
	danger: { rule: "border-l-red-400", icon: ShieldAlert, iconClass: "text-red-400" },
};

export function Callout({
	tone = "info",
	title,
	children,
	className,
}: {
	tone?: Tone;
	title?: string;
	children: ReactNode;
	className?: string;
}) {
	const { rule, icon: Icon, iconClass } = TONES[tone];
	return (
		<div
			className={cn(
				"flex gap-3 rounded-lg border-l-2 bg-[var(--surface-3)] px-4 py-3.5 t-label",
				rule,
				className,
			)}
		>
			<Icon size={16} className={cn("mt-0.5 shrink-0", iconClass)} aria-hidden />
			<div className="space-y-1">
				{title && <p className="font-medium text-[var(--ink-1)]">{title}</p>}
				<div className="leading-relaxed text-[var(--ink-2)]">{children}</div>
			</div>
		</div>
	);
}
