import { cn } from "@app/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * Button.
 *
 * Avantis runs flat fills on a 6px radius rather than gradients: one solid
 * accent for the primary action, a surface fill for the secondary, and a
 * hairline for everything quieter. Long and short keep their own semantics.
 */
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-lime-500/40 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default: "bg-lime-500 text-black hover:bg-lime-400",
				shine: "bg-lime-500 text-black hover:bg-lime-400",
				secondary: "bg-[var(--surface-4)] text-[var(--ink-1)] hover:bg-[var(--surface-5)]",
				outline:
					"border border-[var(--line)] bg-transparent text-[var(--ink-1)] hover:border-[var(--ink-2)] hover:bg-[var(--surface-3)]",
				ghost:
					"bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-1)]",
				link: "text-lime-400 underline-offset-4 hover:underline",
				destructive: "bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/85",
				"trade-long": "bg-[var(--trade-long)] text-black hover:bg-[var(--trade-long)]/85",
				"trade-short": "bg-[var(--trade-short)] text-white hover:bg-[var(--trade-short)]/85",
				toolbar:
					"bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-1)] data-[state=active]:bg-[var(--surface-4)] data-[state=active]:text-[var(--ink-1)]",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 rounded px-3 text-xs has-[>svg]:px-2.5",
				lg: "h-11 rounded-md px-6 text-base has-[>svg]:px-4",
				icon: "size-9",
			},
		},
		defaultVariants: {
			variant: "shine",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
