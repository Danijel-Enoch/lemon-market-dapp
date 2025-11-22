"use client";

import { ProgressProvider } from "@bprogress/next/app";

export function BProgressProvider({children}: {children: React.ReactNode}) {
	return (
		<ProgressProvider
			height="3px"
			color="#004530"
			options={{ showSpinner: false }}
			shallowRouting
		>
			{children}
		</ProgressProvider>
	);
}
