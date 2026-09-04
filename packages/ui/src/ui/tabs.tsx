import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "../utils";

/**
 * Tabs.
 *
 * Pons has one tab shape: a pill track on the well surface holding pill
 * segments, where the active segment is filled with the next surface up. There
 * is no underline and no shadow. The track scrolls rather than wrapping on
 * narrow screens so a long set never reflows the panel under it.
 */

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-4", className)}
			{...props}
		/>
	);
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"inline-flex w-fit max-w-full items-stretch overflow-x-auto rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-[3px] scrollbar-hide",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4.5 py-2 text-[13px] font-medium text-[var(--pon-fg-3)] outline-none transition-colors",
				"hover:text-[var(--pon-fg)] focus-visible:ring-2 focus-visible:ring-[var(--pon-lime)]/40",
				"disabled:pointer-events-none disabled:opacity-50",
				"data-[state=active]:bg-[var(--pon-surface-2)] data-[state=active]:font-semibold data-[state=active]:text-[var(--pon-fg)]",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
