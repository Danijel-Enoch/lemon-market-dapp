import { cn } from "@app/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex h-9 w-full min-w-0 rounded border border-[var(--line-soft)] bg-transparent px-3 py-1 text-base outline-none transition-colors md:text-sm",
				"text-[var(--ink-1)] placeholder:text-[var(--ink-2)] selection:bg-lime-500 selection:text-black",
				"hover:border-[var(--ink-2)] focus-visible:border-[var(--ink-2)]",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ink-1)]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
