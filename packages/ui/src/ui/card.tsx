import type * as React from "react";
import { cn } from "../utils";

/**
 * Card.
 *
 * A hairline box drawn straight onto the field — no fill, no shadow, a 4px
 * corner. The header is ruled off from the body rather than separated by a
 * gap, which is how The Firm divides a panel: cells sharing one frame, split
 * by lines. CardTitle is the monospaced caps label that names the cell;
 * CardHeading is there for the cards that want a real serif title.
 */

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn(
				"flex flex-col rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] text-[var(--pon-fg)]",
				className,
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 border-b border-[var(--pon-line)] px-4 py-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] md:px-5",
				className,
			)}
			{...props}
		/>
	);
}

/** The cell label: monospaced, uppercase, letterspaced, quiet. */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-title" className={cn("pon-section-label", className)} {...props} />;
}

/** A card that wants a real heading rather than a section label. */
function CardHeading({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-heading"
			className={cn("t-h3 text-[var(--pon-fg-0)]", className)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-description"
			className={cn("t-caption text-[var(--pon-fg-3)]", className)}
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-action"
			className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-content" className={cn("px-4 py-4 md:px-5", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn(
				"flex items-center border-t border-[var(--pon-line)] px-4 py-3 md:px-5",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardHeading,
	CardAction,
	CardDescription,
	CardContent,
};
