import { AuthGate } from "@app/components/ui/AuthGate";
import type { ComponentType } from "react";
import { Outlet, useMatches } from "react-router";

interface AuthHandle {
	authTitle?: string;
	authDescription?: string;
	authIcon?: ComponentType<{ className?: string }>;
}

export default function AuthLayout() {
	const matches = useMatches();
	// Get the handle from the deepest matched route (child page)
	const handle = matches.findLast((m) => (m.handle as AuthHandle)?.authTitle)?.handle as
		| AuthHandle
		| undefined;

	return (
		<AuthGate
			title={handle?.authTitle}
			description={handle?.authDescription}
			icon={handle?.authIcon}
		>
			<Outlet />
		</AuthGate>
	);
}
