import { cn } from "../utils";

/**
 * Segmented control.
 *
 * A hairline track of square segments divided by rules, where the active one
 * inverts to ink. This is the controlled, non-Radix form — for anything that
 * is just picking a value rather than swapping a panel, where Tabs would be
 * the wrong semantics.
 */
export function Segmented<T extends string>({
	options,
	value,
	onChange,
	size = "default",
	className,
	"aria-label": ariaLabel,
}: {
	options: readonly T[] | readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	size?: "sm" | "default";
	className?: string;
	"aria-label"?: string;
}) {
	const items = options.map((option) =>
		typeof option === "string" ? { value: option, label: option } : option,
	);

	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn(
				"inline-flex w-fit max-w-full items-stretch overflow-x-auto rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)] scrollbar-hide [&>*+*]:border-l [&>*+*]:border-[var(--pon-line-2)]",
				className,
			)}
		>
			{items.map((item) => {
				const active = item.value === value;
				return (
					<button
						key={item.value}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(item.value)}
						className={cn(
							"shrink-0 whitespace-nowrap font-mono tracking-[-0.02em] transition-colors",
							size === "sm" ? "px-3 py-1.5 text-[11.5px]" : "px-4 py-2 text-[12.5px]",
							active
								? "bg-[var(--pon-ink)] text-[var(--pon-on-lime)]"
								: "text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
						)}
					>
						{item.label}
					</button>
				);
			})}
		</div>
	);
}

/**
 * Filter chips.
 *
 * The other selector: free-standing hairline boxes where the selected one
 * inverts to ink. Used for ranges and quick amounts — anywhere the options are
 * peers rather than a track of adjacent segments.
 */
export function ChipGroup<T extends string>({
	options,
	value,
	onChange,
	className,
	"aria-label": ariaLabel,
}: {
	options: readonly T[] | readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	className?: string;
	"aria-label"?: string;
}) {
	const items = options.map((option) =>
		typeof option === "string" ? { value: option, label: option } : option,
	);

	return (
		<fieldset
			aria-label={ariaLabel}
			className={cn("m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0", className)}
		>
			{items.map((item) => {
				const active = item.value === value;
				return (
					<button
						key={item.value}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(item.value)}
						className={cn(
							"rounded-[var(--pon-r-sm)] border px-3 py-1.5 font-mono text-[11.5px] tracking-[-0.02em] transition-colors",
							active
								? "border-[var(--pon-ink)] bg-[var(--pon-ink)] text-[var(--pon-on-lime)]"
								: "border-[var(--pon-line)] bg-transparent text-[var(--pon-fg-2)] hover:border-[var(--pon-ink)]",
						)}
					>
						{item.label}
					</button>
				);
			})}
		</fieldset>
	);
}

/**
 * Timeframe picker — the borderless variant for chart headers, where a
 * bordered box would compete with the frame it sits in. The active one is
 * underscored rather than filled, so the row stays quiet.
 */
export function TimeframeGroup<T extends string>({
	options,
	value,
	onChange,
	className,
	"aria-label": ariaLabel,
}: {
	options: readonly T[];
	value: T;
	onChange: (value: T) => void;
	className?: string;
	"aria-label"?: string;
}) {
	return (
		<fieldset
			aria-label={ariaLabel}
			className={cn("m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0", className)}
		>
			{options.map((option) => {
				const active = option === value;
				return (
					<button
						key={option}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(option)}
						className={cn(
							"rounded-none border-b px-2 py-1 font-mono text-[11.5px] tracking-[-0.02em] transition-colors",
							active
								? "border-[var(--pon-ink)] text-[var(--pon-fg-0)]"
								: "border-transparent text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
						)}
					>
						{option}
					</button>
				);
			})}
		</fieldset>
	);
}
