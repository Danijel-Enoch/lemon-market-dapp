import { cn } from "@app/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * Button.
 *
 * Pons runs every action as a pill. The hierarchy is carried by fill rather
 * than by size: one solid lime for the primary action, a hairline for the
 * secondary, and nothing at all for the quiet one. Long and short keep their
 * own semantics and are the only buttons that break the pill for a softer
 * corner, because they sit in a two-up grid where pills read as separate pills.
 */
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pon-lime)]/40 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default: "bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				shine: "bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				secondary:
					"border border-[var(--pon-line-2)] bg-transparent text-[var(--pon-fg)] hover:border-[var(--pon-fg-3)]",
				outline:
					"border border-[var(--pon-line-2)] bg-transparent text-[var(--pon-fg)] hover:border-[var(--pon-fg-3)]",
				ghost:
					"bg-transparent font-medium text-[var(--pon-fg-2)] hover:bg-[var(--pon-surface-2)] hover:text-[var(--pon-fg)]",
				link: "rounded-none px-0 text-[var(--pon-lime)] underline-offset-4 hover:text-[var(--pon-lime-2)] hover:underline",
				destructive: "bg-[var(--pon-down)] text-white hover:bg-[var(--pon-down)]/85",
				"trade-long":
					"rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				"trade-short":
					"rounded-[var(--pon-r-sm)] bg-[var(--pon-down)] text-white hover:bg-[var(--pon-down)]/85",
				/* Segment inside a Pons pill group — filled when active, bare otherwise. */
				toolbar:
					"bg-transparent font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)] data-[state=active]:bg-[var(--pon-surface-2)] data-[state=active]:font-semibold data-[state=active]:text-[var(--pon-fg)]",
			},
			size: {
				default: "px-[22px] py-[11px] text-sm",
				sm: "px-4 py-2 text-[13px]",
				lg: "px-7 py-[13px] text-[15px]",
				icon: "size-[38px] p-0",
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
