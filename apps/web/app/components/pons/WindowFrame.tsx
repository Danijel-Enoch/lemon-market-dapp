import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Window frame.
 *
 * Pons presents a screenshot of itself inside browser chrome — three dots and a
 * URL over a hairline — so a page shown inside another page reads as a
 * depiction rather than as live UI the reader could click. Used on the landing
 * and docs surfaces.
 */
export function WindowFrame({
	url,
	children,
	className,
}: {
	url: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<figure
			className={cn(
				"overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-bg)]",
				className,
			)}
		>
			<div className="flex items-center gap-2 border-b border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2.5">
				<span aria-hidden className="size-[11px] rounded-full bg-[var(--pon-down)]" />
				<span aria-hidden className="size-[11px] rounded-full bg-[var(--pon-amber)]" />
				<span aria-hidden className="size-[11px] rounded-full bg-[var(--pon-lime)]" />
				<figcaption className="ml-2.5 truncate t-caption text-[var(--pon-fg-3)]">{url}</figcaption>
			</div>
			<div>{children}</div>
		</figure>
	);
}
