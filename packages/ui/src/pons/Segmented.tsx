import { cn } from "../utils";

/**
 * Segmented control.
 *
 * The Pons switch: a pill track on the well surface holding pill segments,
 * where the active one is filled with the next surface up and gains weight.
 * This is the controlled, non-Radix form — for anything that is just picking a
 * value rather than swapping a panel, where Tabs would be the wrong semantics.
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
				"inline-flex w-fit max-w-full items-stretch overflow-x-auto rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-[3px] scrollbar-hide",
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
							"shrink-0 whitespace-nowrap rounded-full transition-colors",
							size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-4.5 py-2 text-[13px]",
							active
								? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
								: "font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
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
 * Pons' other selector: free-standing hairline pills where the selected one
 * inverts to a lime fill. Used for ranges and quick amounts — anywhere the
 * options are peers rather than a track of adjacent segments.
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
							"rounded-full border px-3.5 py-1.5 text-xs transition-colors",
							active
								? "border-[var(--pon-lime)] bg-[var(--pon-lime)] font-semibold text-[var(--pon-on-lime)]"
								: "border-[var(--pon-line)] bg-transparent text-[var(--pon-fg-2)] hover:border-[var(--pon-fg-3)]",
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
 * Timeframe picker — the borderless variant Pons puts inside chart headers,
 * where a bordered chip would compete with the card frame it sits in.
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
							"rounded-full px-2.5 py-1 text-xs transition-colors",
							active
								? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
								: "font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
						)}
					>
						{option}
					</button>
				);
			})}
		</fieldset>
	);
}
