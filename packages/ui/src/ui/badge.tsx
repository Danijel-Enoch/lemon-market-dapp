import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../utils";

/**
 * Badge.
 *
 * Pons splits small labels in two. Chips are pills and describe a thing you
 * could act on — a token, an address, a filter. Tags are 8px-radius boxes and
 * describe a state a thing is already in — "Graduated", "Perp", "20x". The
 * default here is the tag, because that is what a badge is used for; `chip`
 * and its variants cover the pill side.
 */
const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border font-semibold [&>svg]:size-3 [&>svg]:pointer-events-none overflow-hidden transition-colors",
	{
		variants: {
			variant: {
				/* Tag — a state. */
				default:
					"rounded-[var(--pon-r-sm)] border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] px-2 py-0.5 text-[10px] text-[var(--pon-lime)]",
				neutral:
					"rounded-[var(--pon-r-sm)] border-[var(--pon-line-2)] bg-black/55 px-2.5 py-1 text-[11px] text-[var(--pon-fg)]",
				secondary:
					"rounded-[var(--pon-r-sm)] border-[var(--pon-line)] bg-[var(--pon-surface-2)] px-2.5 py-1 text-[11px] font-normal text-[var(--pon-fg-2)]",
				outline:
					"rounded-[var(--pon-r-sm)] border-[var(--pon-line)] px-2.5 py-1 text-[11px] font-normal text-[var(--pon-fg-3)]",
				destructive:
					"rounded-[var(--pon-r-sm)] border-[var(--pon-down)] bg-[var(--pon-down)]/12 px-2 py-0.5 text-[10px] text-[var(--pon-down)]",
				/* Chip — a thing. */
				chip: "rounded-full border-[var(--pon-line)] bg-[var(--pon-surface-2)] px-3 py-1.5 text-xs font-normal text-[var(--pon-fg-2)]",
				"chip-outline":
					"rounded-full border-[var(--pon-line)] bg-transparent px-3 py-1.5 text-xs font-normal text-[var(--pon-fg-2)]",
				"chip-accent":
					"rounded-full border-transparent bg-[var(--pon-lime-dim)] px-2.5 py-1 text-[10px] text-[var(--pon-lime)]",
				"chip-solid":
					"rounded-full border-transparent bg-[var(--pon-lime)] px-3 py-1.5 text-xs text-[var(--pon-on-lime)]",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

/**
 * Token chip — the pill with a colour dot Pons uses to name an asset inline,
 * in swap fields and amount rows.
 */
function TokenChip({
	symbol,
	color = "var(--pon-lime)",
	round = true,
	className,
}: {
	symbol: string;
	color?: string;
	round?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--pon-line)] bg-[var(--pon-surface-2)] px-3 py-1.5 text-xs text-[var(--pon-fg-2)]",
				className,
			)}
		>
			<span
				aria-hidden
				className={cn("size-3.5 shrink-0", round ? "rounded-full" : "rounded-[4px]")}
				style={{ background: color }}
			/>
			{symbol}
		</span>
	);
}

/** Address chip — tabular, hairline, no fill. */
function AddressChip({ address, className }: { address: string; className?: string }) {
	return (
		<span
			className={cn(
				"font-fono inline-flex w-fit items-center rounded-full border border-[var(--pon-line)] px-3 py-1.5 text-xs text-[var(--pon-fg-2)]",
				className,
			)}
		>
			{address}
		</span>
	);
}

/** Live indicator — the pulsing lime dot Pons puts on streaming panels. */
function LiveDot({ label = "Live", className }: { label?: string; className?: string }) {
	return (
		<span
			className={cn("inline-flex items-center gap-1.5 t-micro text-[var(--pon-lime)]", className)}
		>
			<span aria-hidden className="animate-pon-pulse size-1.5 rounded-full bg-[var(--pon-lime)]" />
			{label}
		</span>
	);
}

export { Badge, badgeVariants, TokenChip, AddressChip, LiveDot };
