import { cn } from "@app/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Bottom sheet, the native-app pattern for entering a value without leaving the
 * screen you are on.
 *
 * Used for order entry on mobile: the alternative — pushing the form below the
 * chart — means scrolling away from the price to place a trade, which is
 * exactly the wrong trade-off on a small screen.
 */
export function Sheet({
	open,
	onOpenChange,
	title,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	children: ReactNode;
}) {
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<DialogPrimitive.Content
					className={cn(
						"fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[var(--pon-r-2xl)] border-t border-[var(--pon-line)] bg-[var(--pon-surface)] p-4",
						// Clears the home indicator on gesture-nav phones.
						"pb-[calc(1rem+env(safe-area-inset-bottom))]",
						"data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
					)}
				>
					{/* Grab handle — signals the sheet is dismissible by drag/tap-away. */}
					<div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--pon-line-2)]" aria-hidden />

					<div className="mb-3 flex items-center justify-between">
						<DialogPrimitive.Title className="font-display text-base font-bold text-[var(--pon-fg)]">
							{title}
						</DialogPrimitive.Title>
						<DialogPrimitive.Close className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--pon-line-2)] text-[var(--pon-fg-3)] transition-colors hover:border-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]">
							<X size={18} aria-hidden />
							<span className="sr-only">Close</span>
						</DialogPrimitive.Close>
					</div>

					{children}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

/** Height of the floating tab bar, tab-bar padding included but not the inset. */
export const TAB_BAR_HEIGHT = 84;

/**
 * Fixed action bar sitting above the mobile tab bar.
 *
 * Keeps the primary action reachable with a thumb no matter how far the page
 * has scrolled.
 *
 * Hidden at `lg`, not `md`. The desktop ticket only appears at `lg`, so hiding
 * this one at `md` leaves tablet widths with no way to open a position at all —
 * a gap that is invisible on both a phone and a laptop.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
	return (
		<div
			className="fixed inset-x-0 z-40 border-t border-[var(--pon-line)] bg-[var(--pon-bg)]/95 px-3 py-3 backdrop-blur-md lg:hidden"
			style={{ bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))` }}
		>
			{children}
		</div>
	);
}
