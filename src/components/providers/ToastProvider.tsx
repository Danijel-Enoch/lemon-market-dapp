"use client";

import { Toaster } from "sonner";

interface ToastProviderProps {
	children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
	return (
		<>
			{children}
			<Toaster
				position="top-right"
				toastOptions={{
					style: {
						background: "hsl(var(--background))",
						border: "1px solid hsl(var(--border))",
						color: "hsl(var(--foreground))",
					},
				}}
				theme="dark"
				richColors
				closeButton
				expand={false}
				visibleToasts={5}
				duration={4000}
			/>
		</>
	);
}
