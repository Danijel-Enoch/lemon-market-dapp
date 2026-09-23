import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Window frame.
 *
 * A page shown inside another page is presented in browser chrome — three
 * squares and a monospaced URL over a hairline — so it reads as a depiction
 * rather than as live UI the reader could click. Used on the landing and docs
 * surfaces.
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
				"overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)]",
				className,
			)}
		>
			<div className="flex items-center gap-1.5 border-b border-[var(--pon-line-2)] px-3 py-2">
				<span aria-hidden className="size-2 bg-[var(--pon-line-2)]" />
				<span aria-hidden className="size-2 bg-[var(--pon-line-2)]" />
				<span aria-hidden className="size-2 bg-[var(--pon-line-2)]" />
				<figcaption className="ml-2 truncate t-caption text-[var(--pon-fg-3)]">{url}</figcaption>
			</div>
			<div>{children}</div>
		</figure>
	);
}
