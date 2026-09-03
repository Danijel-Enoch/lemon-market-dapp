import { cn } from "@app/lib/utils";
import type * as React from "react";

/**
 * Input.
 *
 * Pons recesses every field: the fill drops a rung to the well surface, the
 * border steps up to the stronger hairline so the field reads as interactive,
 * and focus is signalled by the lime edge alone — no ring, no shadow.
 */
const fieldClass =
	"w-full rounded-[var(--pon-r-md)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3.5 py-3 text-sm text-[var(--pon-fg)] outline-none transition-colors placeholder:text-[var(--pon-fg-3)] selection:bg-[var(--pon-lime)] selection:text-[var(--pon-on-lime)] focus-visible:border-[var(--pon-lime)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-[var(--pon-down)]";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				fieldClass,
				"file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--pon-fg)]",
				className,
			)}
			{...props}
		/>
	);
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(fieldClass, "min-h-[72px] resize-y leading-relaxed", className)}
			{...props}
		/>
	);
}

/**
 * Field wrapper — the Pons composite input: an icon or prefix, a bare input,
 * and an optional suffix (a unit, a shortcut hint) all inside one well.
 */
function InputGroup({
	prefix,
	suffix,
	className,
	children,
}: {
	prefix?: React.ReactNode;
	suffix?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3.5 py-3 transition-colors focus-within:border-[var(--pon-lime)]",
				className,
			)}
		>
			{prefix && <span className="shrink-0 text-sm text-[var(--pon-fg-3)]">{prefix}</span>}
			{children}
			{suffix && <span className="ml-auto shrink-0">{suffix}</span>}
		</div>
	);
}

/** The bare input to drop inside an InputGroup. */
function BareInput({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--pon-fg)] outline-none placeholder:text-[var(--pon-fg-3)]",
				className,
			)}
			{...props}
		/>
	);
}

/** Field help text, per Pons: 11.5px, tertiary ink, sits under the field. */
function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("mt-1.5 t-micro text-[var(--pon-fg-3)]", className)} {...props} />;
}

export { Input, Textarea, InputGroup, BareInput, FieldHint };
