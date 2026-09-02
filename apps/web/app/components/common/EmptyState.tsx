import { cn } from "@app/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
				"flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center",
				className,
			)}
		>
			{Icon && <Icon size={28} className="text-gray-600" aria-hidden />}
			<p className="font-medium text-gray-200">{title}</p>
			{children && <div className="max-w-md text-sm text-gray-500">{children}</div>}
			{action}
		</div>
	);
}
