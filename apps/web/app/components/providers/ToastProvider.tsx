import { WalletProvider } from "@app/components/providers/WalletProvider";
import { cn } from "@lemon/ui";
import { AlertTriangle, Check, Info } from "lucide-react";
import type { ReactNode } from "react";
import { type Toast, Toaster } from "react-hot-toast";

/**
 * Toasts.
 *
 * Pons builds a toast from the same parts as everything else: the well surface,
 * a hairline in the tone's colour, and a round badge holding the glyph. Tone
 * lives on the border and the badge, never on the body fill, so a stack of
 * mixed toasts reads as one column rather than a set of coloured slabs.
 */

function ToastShell({
	border,
	badge,
	badgeClass,
	children,
}: {
	border: string;
	badge: ReactNode;
	badgeClass: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"firm-paper flex items-center gap-3 rounded-[var(--pon-r-lg)] border px-3.5 py-3",
				border,
			)}
		>
			<span
				className={cn(
					"flex size-[24px] shrink-0 items-center justify-center rounded-[var(--pon-r-sm)]",
					badgeClass,
				)}
			>
				{badge}
			</span>
			<p className="font-mono text-[12px] tracking-[-0.02em] text-[var(--pon-fg)]">{children}</p>
		</div>
	);
}

export function ErrorToast({ toast }: { toast: Toast }) {
	return (
		<ToastShell
			border="border-[var(--pon-down)]"
			badgeClass="border border-[var(--pon-down)] text-[var(--pon-down)]"
			badge={<AlertTriangle size={13} aria-hidden />}
		>
			{toast.message?.toString()}
		</ToastShell>
	);
}

export function SuccessToast({ toast }: { toast: Toast }) {
	return (
		<ToastShell
			border="border-[var(--pon-lime)]"
			badgeClass="bg-[var(--pon-ink)] text-[var(--pon-on-lime)]"
			badge={<Check size={13} aria-hidden />}
		>
			{toast.message?.toString()}
		</ToastShell>
	);
}

export function InfoToast({ toast }: { toast: Toast }) {
	return (
		<ToastShell
			border="border-[var(--pon-line-2)]"
			badgeClass="border border-[var(--pon-line-2)] text-[var(--pon-fg-2)]"
			badge={<Info size={13} aria-hidden />}
		>
			{toast.message?.toString()}
		</ToastShell>
	);
}

export function LoadingToast({ toast }: { toast: Toast }) {
	return (
		<ToastShell
			border="border-[var(--pon-line-2)]"
			badgeClass="border border-[var(--pon-line-2)]"
			badge={
				<span
					aria-hidden
					className="size-3.5 animate-spin rounded-full border-2 border-[var(--pon-fg-3)] border-t-transparent"
				/>
			}
		>
			{toast.message?.toString()}
		</ToastShell>
	);
}

export function ToastProvider({ children }: { children: ReactNode }) {
	return (
		<WalletProvider>
			{children}
			<Toaster
				position="bottom-center"
				reverseOrder={false}
				toastOptions={{
					duration: 4000,
					/* The rendered toast below carries the whole treatment, so the
					   library's own chrome is stripped rather than restyled. */
					style: { background: "transparent", boxShadow: "none", padding: 0, margin: 0 },
				}}
			>
				{(toast) => {
					if (toast.type === "error") return <ErrorToast toast={toast} />;
					if (toast.type === "success") return <SuccessToast toast={toast} />;
					if (toast.type === "loading") return <LoadingToast toast={toast} />;
					return <InfoToast toast={toast} />;
				}}
			</Toaster>
		</WalletProvider>
	);
}
