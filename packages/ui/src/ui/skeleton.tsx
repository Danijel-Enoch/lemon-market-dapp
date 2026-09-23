import { cn } from "../utils";

/**
 * Skeleton.
 *
 * A hairline box with the cream tint behind it, pulsing in steps rather than
 * easing. Nothing in this system has a soft edge, a loading state least of
 * all — it should read as a cell waiting for its figure.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"animate-pon-pulse rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-lime-dim)]",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
