import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card";
import { Skeleton } from "@app/components/ui/skeleton";
import { cn } from "@app/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
	title: string;
	value: string | number;
	icon?: LucideIcon;
	change?: string;
	changeType?: "positive" | "negative" | "neutral";
	className?: string;
	isLoading?: boolean;
}

export function StatCard({
	title,
	value,
	icon: Icon,
	change,
	changeType = "neutral",
	className,
	isLoading = false,
}: StatCardProps) {
	return (
		<Card className={cn("border-accent/20", className)}>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
					{Icon && (
						<div className="rounded-lg bg-linear-to-br from-primary/20 to-primary/10 p-2">
							<Icon className="size-4 text-primary" />
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				{isLoading ? (
					<Skeleton className="h-8 w-20" />
				) : (
					<div className="text-2xl font-bold">{value}</div>
				)}
				{change && (
					<p
						className={cn(
							"text-xs font-medium",
							changeType === "positive" && "text-green-500",
							changeType === "negative" && "text-red-500",
							changeType === "neutral" && "text-muted-foreground",
						)}
					>
						{change}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
