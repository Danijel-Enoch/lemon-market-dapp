import { cn } from "@app/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("animate-pulse rounded-lg bg-[var(--surface-3)]", className)} {...props} />
	);
}

export { Skeleton };
