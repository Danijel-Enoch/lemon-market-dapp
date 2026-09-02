import { cn } from "@app/lib/utils";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "warning" | "danger";

const TONES: Record<Tone, { wrapper: string; icon: typeof Info }> = {
	info: { wrapper: "border-sky-500/30 bg-sky-500/5 text-sky-100", icon: Info },
	warning: { wrapper: "border-amber-500/30 bg-amber-500/5 text-amber-100", icon: AlertTriangle },
	danger: { wrapper: "border-red-500/40 bg-red-500/10 text-red-100", icon: ShieldAlert },
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
	const { wrapper, icon: Icon } = TONES[tone];
	return (
		<div className={cn("flex gap-3 rounded-lg border p-3 text-sm", wrapper, className)}>
			<Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
			<div className="space-y-1">
				{title && <p className="font-semibold">{title}</p>}
				<div className="leading-relaxed opacity-90">{children}</div>
			</div>
		</div>
	);
}
