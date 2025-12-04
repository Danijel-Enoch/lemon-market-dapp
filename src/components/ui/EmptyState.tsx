import { Inbox } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

interface EmptyStateProps {
	/** Icon component to display (defaults to Inbox) */
	icon?: ComponentType<{ className?: string }>;
	/** Main title text */
	title: string;
	/** Optional description text */
	description?: string;
	/** Optional action button or link */
	action?: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * EmptyState - A consistent component for displaying empty data states.
 * 
 * Usage:
 * ```tsx
 * <EmptyState 
 *   icon={Wallet}
 *   title="No positions yet"
 *   description="Open your first position to get started."
 *   action={<Button>Start Trading</Button>}
 * />
 * ```
 */
export function EmptyState({
	icon: Icon = Inbox,
	title,
	description,
	action,
	className = "",
}: EmptyStateProps) {
	return (
		<div className={`flex flex-col items-center justify-center py-8 text-center ${className}`}>
			<div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mb-4">
				<Icon className="w-6 h-6 text-muted-foreground opacity-60" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
			{description && (
				<p className="text-muted-foreground text-sm max-w-md mb-4">
					{description}
				</p>
			)}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
