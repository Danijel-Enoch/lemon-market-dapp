import { cn } from "@app/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

/**
 * Tabs.
 *
 * Avantis has one tab shape everywhere: a 4px-radius hairline box whose active
 * segment is filled with the next surface up — no underline, no shadow. It
 * scrolls horizontally on narrow screens rather than wrapping.
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
				"inline-flex w-fit max-w-full items-stretch overflow-x-auto rounded border border-[var(--line-soft)] bg-transparent scrollbar-hide",
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
				"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded px-4 py-2 t-caption font-normal text-[var(--ink-2)] transition-colors outline-none",
				"hover:text-[var(--ink-1)] focus-visible:ring-2 focus-visible:ring-lime-500/40",
				"disabled:pointer-events-none disabled:opacity-50",
				"data-[state=active]:bg-[var(--surface-4)] data-[state=active]:text-[var(--ink-1)]",
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
