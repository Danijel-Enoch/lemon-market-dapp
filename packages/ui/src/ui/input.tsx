import type * as React from "react";
import { cn } from "../utils";

/**
 * Input.
 *
 * A field is a ruled well: a square box on the stronger hairline, its value
 * set in the mono at the same size the rest of the chrome is. Focus doubles
 * the edge to full-strength ink — no ring, no glow, no shadow.
 */
const fieldClass =
	"w-full rounded-[var(--pon-r-md)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3 py-2.5 font-mono text-[13px] tracking-[-0.02em] text-[var(--pon-fg)] outline-none transition-colors placeholder:text-[var(--pon-fg-3)] selection:bg-[var(--pon-ink)] selection:text-[var(--pon-on-lime)] focus-visible:border-[var(--pon-ink)] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-[var(--pon-down)]";

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
				"flex items-center gap-2.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3 py-2.5 transition-colors focus-within:border-[var(--pon-ink)]",
				className,
			)}
		>
			{prefix && (
				<span className="shrink-0 font-mono text-[13px] text-[var(--pon-fg-3)]">{prefix}</span>
			)}
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
				"min-w-0 flex-1 border-none bg-transparent font-mono text-[13px] tracking-[-0.02em] text-[var(--pon-fg)] outline-none placeholder:text-[var(--pon-fg-3)]",
				className,
			)}
			{...props}
		/>
	);
}

/** Field help text: 10.5px mono, tertiary ink, sits under the field. */
function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("mt-1.5 t-micro text-[var(--pon-fg-3)]", className)} {...props} />;
}

export { Input, Textarea, InputGroup, BareInput, FieldHint };
