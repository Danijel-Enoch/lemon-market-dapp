import type * as React from "react";
import { cn } from "../utils";

/**
 * Table.
 *
 * A table is the system's natural shape — ruled cells, no fill. The header is
 * a row of monospaced caps over a full-strength rule, rows are divided by
 * hairlines, and the last one drops its rule so the frame closes cleanly.
 * Every cell is monospaced and tabular, so a ticking column never shifts.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div data-slot="table-container" className="relative w-full overflow-x-auto scrollbar-hide">
			<table
				data-slot="table"
				className={cn(
					"w-full caption-bottom font-mono text-[12.5px] tracking-[-0.02em]",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("[&_tr]:border-b [&_tr]:border-[var(--pon-line-2)]", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn("border-t border-[var(--pon-line-2)] [&>tr]:last:border-b-0", className)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"border-b border-[var(--pon-line)] transition-colors hover:bg-[var(--pon-lime-dim)] data-[state=selected]:bg-[var(--pon-lime-dim)]",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"whitespace-nowrap px-3 pb-2 text-left align-middle text-[10.5px] font-normal uppercase tracking-[0.12em] text-[var(--pon-fg-3)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-[var(--pon-fg)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("mt-4 t-caption text-[var(--pon-fg-3)]", className)}
			{...props}
		/>
	);
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
