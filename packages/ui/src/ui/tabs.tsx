import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "../utils";

/**
 * Tabs.
 *
 * One tab shape: a hairline track holding square segments divided by rules,
 * where the active segment inverts to an ink fill with lime type. There is no
 * underline, no pill and no shadow. The track scrolls rather than wrapping on
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
				"inline-flex w-fit max-w-full items-stretch overflow-x-auto rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)] scrollbar-hide [&>*+*]:border-l [&>*+*]:border-[var(--pon-line-2)]",
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
				"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 py-2 font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-fg-3)] outline-none transition-colors",
				"hover:text-[var(--pon-fg)] focus-visible:text-[var(--pon-fg)]",
				"disabled:pointer-events-none disabled:opacity-45",
				"data-[state=active]:bg-[var(--pon-ink)] data-[state=active]:text-[var(--pon-on-lime)]",
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
