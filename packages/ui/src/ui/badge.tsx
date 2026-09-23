import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../utils";

/**
 * Badge.
 *
 * All small labels are the same shape here — a monospaced box on a 2px corner
 * — and they differ only in how they are filled. A state is a bare hairline or
 * the cream tint; a thing you could act on is the paper inversion, which is
 * what The Firm does with its "BREAKING" chips and its token pills. The
 * chip/tag split the previous system drew by radius is now drawn by fill, so
 * the variant names survive and the shapes agree.
 */
const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--pon-r-sm)] border font-mono font-normal tracking-[-0.02em] [&>svg]:size-3 [&>svg]:pointer-events-none overflow-hidden transition-colors",
	{
		variants: {
			variant: {
				/* The cream tint — the one colour the field carries. */
				default:
					"border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] px-2 py-0.5 text-[10.5px] text-[var(--pon-ink)]",
				neutral:
					"border-[var(--pon-line-2)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--pon-fg)]",
				secondary:
					"border-[var(--pon-line)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--pon-fg-2)]",
				outline:
					"border-[var(--pon-line)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--pon-fg-3)]",
				destructive:
					"border-[var(--pon-down)] bg-transparent px-2 py-0.5 text-[10.5px] text-[var(--pon-down)]",
				/* Chips — same box, filled. */
				chip: "border-[var(--pon-line)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--pon-fg-2)]",
				"chip-outline":
					"border-[var(--pon-line)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--pon-fg-2)]",
				"chip-accent":
					"border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] px-2 py-0.5 text-[10.5px] text-[var(--pon-ink)]",
				/* The paper inversion — the loudest small label in the system. */
				"chip-solid":
					"border-[var(--pon-paper)] bg-[var(--pon-paper)] px-2.5 py-1 text-[11px] text-[var(--pon-ink)]",
				/* The ink inversion. */
				"chip-ink":
					"border-[var(--pon-ink)] bg-[var(--pon-ink)] px-2.5 py-1 text-[11px] text-[var(--pon-on-lime)]",
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
 * Token chip — a named asset inline. The colour swatch is a square, because a
 * system printed on a 4px grid has no circles in it that are not a logo.
 */
function TokenChip({
	symbol,
	color = "var(--pon-ink)",
	round = false,
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
				"inline-flex shrink-0 items-center gap-1.5 rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-2.5 py-1 font-mono text-[11px] tracking-[-0.02em] text-[var(--pon-fg-2)]",
				className,
			)}
		>
			<span
				aria-hidden
				className={cn("size-2.5 shrink-0", round ? "rounded-full" : "rounded-none")}
				style={{ background: color }}
			/>
			{symbol}
		</span>
	);
}

/** Address chip — the contract-address treatment, mono and boxed. */
function AddressChip({ address, className }: { address: string; className?: string }) {
	return (
		<span
			className={cn(
				"font-fono inline-flex w-fit items-center rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-2.5 py-1 text-[11px] text-[var(--pon-fg-2)]",
				className,
			)}
		>
			{address}
		</span>
	);
}

/** Live indicator — a blinking square, stepped rather than eased. */
function LiveDot({ label = "Live", className }: { label?: string; className?: string }) {
	return (
		<span
			className={cn("firm-label inline-flex items-center gap-1.5 text-[var(--pon-fg)]", className)}
		>
			<span aria-hidden className="animate-pon-pulse size-1.5 bg-[var(--pon-ink)]" />
			{label}
		</span>
	);
}

export { Badge, badgeVariants, TokenChip, AddressChip, LiveDot };
