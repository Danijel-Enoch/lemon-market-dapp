import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils";

type Tone = "info" | "warning" | "danger";

/**
 * Notice block.
 *
 * A notice is framed the way a key-facts panel is: a full-strength hairline
 * in the tone's own colour, over the cream tint that is the only fill this
 * system puts on the field. Tone is carried by the frame and the icon, so a
 * warning reads as marked rather than as coloured-in.
 */
const TONES: Record<Tone, { border: string; tint: string; icon: typeof Info; iconClass: string }> =
	{
		info: {
			border: "border-[var(--pon-ink)]",
			tint: "bg-[var(--pon-lime-dim)]",
			icon: Info,
			iconClass: "text-[var(--pon-lime)]",
		},
		warning: {
			border: "border-[var(--pon-amber)]",
			tint: "bg-[var(--pon-lime-dim)]",
			icon: AlertTriangle,
			iconClass: "text-[var(--pon-amber)]",
		},
		danger: {
			border: "border-[var(--pon-down)]",
			tint: "bg-[var(--pon-lime-dim)]",
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
		<div className={cn("flex gap-3 rounded-[var(--pon-r-sm)] border p-4", border, tint, className)}>
			<Icon size={16} className={cn("mt-0.5 shrink-0", iconClass)} aria-hidden />
			<div className="space-y-1.5">
				{title && <p className="firm-label text-[var(--pon-fg-0)]">{title}</p>}
				<div className="t-body text-[var(--pon-fg-2)]">{children}</div>
			</div>
		</div>
	);
}

/**
 * Key facts — the bulleted variant used in the docs, where the list is the
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
				"rounded-[var(--pon-r-sm)] border border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] p-4",
				className,
			)}
		>
			<p className="firm-label mb-2.5 text-[var(--pon-fg-0)]">{title}</p>
			<ul className="t-body space-y-1.5 text-[var(--pon-fg-2)]">
				{facts.map((fact, index) => (
					// Facts are prose fragments with no id; position is their identity.
					// biome-ignore lint/suspicious/noArrayIndexKey: static prose list
					<li key={index} className="flex gap-2">
						<span aria-hidden className="mt-[9px] size-1.5 shrink-0 bg-[var(--pon-ink)]" />
						<span>{fact}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
