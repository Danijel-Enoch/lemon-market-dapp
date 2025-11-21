"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Smooth page transition component using CSS transitions
 * Provides better UX during navigation
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
	const _pathname = usePathname();
	const [isTransitioning, setIsTransitioning] = useState(false);

	useEffect(() => {
		// Trigger transition on route change
		setIsTransitioning(true);
		const timer = setTimeout(() => {
			setIsTransitioning(false);
		}, 150);

		return () => clearTimeout(timer);
	}, []);

	return (
		<div
			className={`transition-opacity duration-150 ease-in-out ${
				isTransitioning ? "opacity-0" : "opacity-100"
			}`}
		>
			{children}
		</div>
	);
}
