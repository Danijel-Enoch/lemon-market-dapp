"use client";

import { ProgressProvider } from "@bprogress/next/app";

export function BProgressProvider() {
    return (
        <ProgressProvider
            height="3px"
            color="#10b981"
            options={{ showSpinner: false }}
            shallowRouting
        />
    );
}
