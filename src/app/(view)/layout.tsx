import type { ReactNode } from "react";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ViewLayout({ children }: { children: ReactNode }) {
	return <div className="pt-24 md:pt-32">{children}</div>;
}
