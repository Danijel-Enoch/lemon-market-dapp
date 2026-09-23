import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../utils";

/**
 * Button.
 *
 * Every control in this system is a monospaced box with a 4px corner. The
 * hierarchy is carried by inversion: the primary action fills with ink and
 * types in lime, the secondary is a bare ink hairline that inverts on hover,
 * and the quiet one is just the label. Nothing is a pill and nothing has a
 * shadow — the frame is the whole of the affordance.
 */
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--pon-r-lg)] font-mono font-normal tracking-[-0.02em] transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--pon-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pon-bg)] aria-invalid:border-[var(--pon-down)]",
	{
		variants: {
			variant: {
				/* The inversion — ink fill, lime type. */
				default:
					"border border-[var(--pon-ink)] bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				shine:
					"border border-[var(--pon-ink)] bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				/* The hairline — bare on the field until you touch it. */
				secondary:
					"border border-[var(--pon-line-2)] bg-transparent text-[var(--pon-fg)] hover:bg-[var(--pon-ink)] hover:text-[var(--pon-on-lime)]",
				outline:
					"border border-[var(--pon-line-2)] bg-transparent text-[var(--pon-fg)] hover:bg-[var(--pon-ink)] hover:text-[var(--pon-on-lime)]",
				/* Paper — the inversion the other way, for use on an ink band. */
				paper:
					"border border-[var(--pon-ink)] bg-[var(--pon-paper)] text-[var(--pon-ink)] hover:bg-[var(--pon-lime-dim)]",
				ghost:
					"border border-transparent bg-transparent text-[var(--pon-fg-2)] hover:border-[var(--pon-line)] hover:text-[var(--pon-fg)]",
				link: "rounded-none border-0 px-0 text-[var(--pon-fg)] underline underline-offset-[3px] decoration-[var(--pon-line-2)] hover:decoration-[var(--pon-ink)]",
				destructive:
					"border border-[var(--pon-down)] bg-[var(--pon-down)] text-[var(--pon-paper)] hover:bg-[var(--pon-paper)] hover:text-[var(--pon-down)]",
				"trade-long":
					"border border-[var(--pon-ink)] bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
				"trade-short":
					"border border-[var(--pon-down)] bg-transparent text-[var(--pon-down)] hover:bg-[var(--pon-down)] hover:text-[var(--pon-paper)]",
				/* Segment inside a ruled track — filled when active. */
				toolbar:
					"border border-transparent bg-transparent text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)] data-[state=active]:bg-[var(--pon-ink)] data-[state=active]:text-[var(--pon-on-lime)]",
			},
			size: {
				default: "px-4 py-[9px] text-[13px]",
				sm: "px-3 py-[6px] text-[12px]",
				lg: "px-5 py-3 text-[14px]",
				icon: "size-[34px] p-0",
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
