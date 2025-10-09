"use client";

import { ProgressProvider } from "@bprogress/next/app";

export function BProgressProvider() {
	return (
		<ProgressProvider
			height="3px"
			color="#004530"
			options={{ showSpinner: false }}
			shallowRouting
		/>
	);
}
