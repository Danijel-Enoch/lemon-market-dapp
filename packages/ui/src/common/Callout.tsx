import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils";

type Tone = "info" | "warning" | "danger";

/**
 * Notice block.
 *
 * Pons frames a notice the way it frames its "key facts" panel: a hairline in
 * the tone's own colour over a matching tint, rather than a left rule on a
 * neutral surface. The tint is faint enough that a warning still sits at the
 * page's weight, but the whole block is unmistakably marked.
 */
const TONES: Record<Tone, { border: string; tint: string; icon: typeof Info; iconClass: string }> =
	{
		info: {
			border: "border-[var(--pon-lime)]",
			tint: "bg-[var(--pon-lime-dim)]",
			icon: Info,
			iconClass: "text-[var(--pon-lime)]",
		},
		warning: {
			border: "border-[var(--pon-amber)]",
			tint: "bg-[var(--pon-amber)]/10",
			icon: AlertTriangle,
			iconClass: "text-[var(--pon-amber)]",
		},
		danger: {
			border: "border-[var(--pon-down)]",
			tint: "bg-[var(--pon-down)]/10",
			icon: ShieldAlert,
			iconClass: "text-[var(--pon-down)]",
		},
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
	const { border, tint, icon: Icon, iconClass } = TONES[tone];
	return (
		<div className={cn("flex gap-3 rounded-[var(--pon-r-md)] border p-4", border, tint, className)}>
			<Icon size={16} className={cn("mt-0.5 shrink-0", iconClass)} aria-hidden />
			<div className="space-y-1.5">
				{title && <p className="text-[13px] font-bold text-[var(--pon-fg)]">{title}</p>}
				<div className="text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">{children}</div>
			</div>
		</div>
	);
}

/**
 * Key facts — the bulleted variant Pons uses in docs, where the list is the
 * whole point and an icon column would just indent it.
 */
export function KeyFacts({
	title = "Key facts",
	facts,
	className,
}: {
	title?: string;
	facts: ReactNode[];
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-[var(--pon-r-md)] border border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] p-4",
				className,
			)}
		>
			<p className="mb-2 text-[13px] font-bold text-[var(--pon-fg)]">{title}</p>
			<ul className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">
				{facts.map((fact, index) => (
					// Facts are prose fragments with no id; position is their identity.
					// biome-ignore lint/suspicious/noArrayIndexKey: static prose list
					<li key={index} className="flex gap-2">
						<span aria-hidden className="text-[var(--pon-lime)]">
							•
						</span>
						<span>{fact}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
