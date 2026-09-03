import { cn } from "@app/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("animate-pulse rounded-[var(--pon-r-md)] bg-[var(--pon-surface-2)]", className)}
			{...props}
		/>
	);
}

export { Skeleton };
