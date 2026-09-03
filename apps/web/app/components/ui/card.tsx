import { cn } from "@app/lib/utils";
import type * as React from "react";

/**
 * Card.
 *
 * The Pons container: a hairline frame on the card surface at 22px, with a
 * 24px inset. Pons labels a card with a spaced uppercase micro-label rather
 * than a heading, so CardTitle carries that treatment and CardHeading is there
 * for the cases that want a real title.
 */

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn(
				"flex flex-col gap-5 rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] py-6 text-[var(--pon-fg)]",
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
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:border-[var(--pon-line)] [.border-b]:pb-5",
				className,
			)}
			{...props}
		/>
	);
}

/** Pons' card label: uppercase, letterspaced, quiet. */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-title" className={cn("pon-section-label", className)} {...props} />;
}

/** A card that wants a real heading rather than a section label. */
function CardHeading({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-heading"
			className={cn(
				"font-display text-base font-semibold leading-tight text-[var(--pon-fg)]",
				className,
			)}
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
	return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn(
				"flex items-center px-6 [.border-t]:border-[var(--pon-line)] [.border-t]:pt-5",
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
