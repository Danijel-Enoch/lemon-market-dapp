import { type Toast, Toaster } from "react-hot-toast";
import { WalletProvider } from "@/components/providers/WalletProvider";

interface CustomToastProps {
	toast: Toast;
}

export function ErrorToast({ toast }: CustomToastProps) {
	return (
		<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<img src="/icon-error.svg" alt="Error" className="w-5 h-5" />
			<p className="text-sm text-red-400">{toast.message?.toString()}</p>
		</div>
	);
}

export function SuccessToast({ toast }: CustomToastProps) {
	return (
		<div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
			<p className="text-sm text-green-400">{toast.message?.toString()}</p>
		</div>
	);
}

export function InfoToast({ toast }: CustomToastProps) {
	return (
		<div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
			<p className="text-sm text-blue-400">{toast.message?.toString()}</p>
		</div>
	);
}

export function LoadingToast({ toast }: CustomToastProps) {
	return (
		<div className="shadow p-3 bg-neutral-500/10 border border-neutral-500/20 rounded-lg flex items-center gap-2">
			<div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
			<p className="text-sm text-neutral-400">{toast.message?.toString()}</p>
		</div>
	);
}

interface ToastProviderProps {
	children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
	return (
		<WalletProvider>
			{children}
			<Toaster
				position="bottom-center"
				reverseOrder={false}
				toastOptions={{
					// Default options for all toasts
					style: {
						background: "hsl(var(--background))",
						border: "1px solid hsl(var(--border))",
						color: "hsl(var(--foreground))",
					},
					// Don't show emoji icons by default
					// theme: "dark",
					duration: 4000,
					className: "rounded-md border",
					error: {
						// Custom styles for error
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--red-600))",
							color: "hsl(var(--error))",
						},
					},
					success: {
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--green-600))",
							color: "hsl(var(--green-400))",
						},
					},
					loading: {
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--border))",
							color: "hsl(var(--foreground))",
						},
					},
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
