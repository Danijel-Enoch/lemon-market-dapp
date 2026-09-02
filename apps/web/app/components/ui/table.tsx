import { cn } from "@app/lib/utils";
import type * as React from "react";

function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div data-slot="table-container" className="relative w-full overflow-x-auto scrollbar-hide">
			<table
				data-slot="table"
				className={cn("w-full caption-bottom t-label", className)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("[&_tr]:border-b [&_tr]:border-[var(--line-soft)]", className)}
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
			className={cn(
				"border-t border-[var(--line-soft)] bg-[var(--surface-3)] font-medium [&>tr]:last:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"border-b border-[var(--line-soft)] transition-colors hover:bg-[var(--surface-3)] data-[state=selected]:bg-[var(--surface-4)]",
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
				"h-8 whitespace-nowrap px-3 py-2 text-left align-middle t-caption font-normal text-[var(--ink-2)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
				"whitespace-nowrap px-3 py-2.5 align-middle text-[var(--ink-1)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
			className={cn("mt-4 t-caption text-[var(--ink-2)]", className)}
			{...props}
		/>
	);
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
