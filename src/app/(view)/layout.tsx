import type { ReactNode } from "react";

export default function ViewLayout({ children }: { children: ReactNode }) {
	return (
		<div className="pt-24 md:pt-32">
			{children}
		</div>
	);
}
