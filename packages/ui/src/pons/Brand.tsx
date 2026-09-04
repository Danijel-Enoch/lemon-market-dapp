import { Link } from "react-router";
import { cn } from "../utils";

/**
 * Brand lockup.
 *
 * Pons pairs a rounded-square mark with a display-face wordmark at a fixed
 * ratio, and the corner radius scales with the mark. Kept as one component so
 * the nav, footer and mobile bar can never drift apart.
 */
export function Brand({
	size = 28,
	showWordmark = true,
	to = "/",
	className,
}: {
	size?: number;
	showWordmark?: boolean;
	to?: string | null;
	className?: string;
}) {
	const inner = (
		<>
			<img
				src="/image/logo.png"
				alt="Lemon Markets"
				width={size}
				height={size}
				className="block shrink-0 rounded-[7px]"
				style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
			/>
			{showWordmark && (
				<span
					className="font-display font-bold tracking-[-0.01em] text-[var(--pon-fg-0)]"
					style={{ fontSize: Math.round(size * 0.7) }}
				>
					Lemon
				</span>
			)}
		</>
	);

	if (to === null) {
		return <span className={cn("inline-flex items-center gap-2.5", className)}>{inner}</span>;
	}

	return (
		<Link to={to} className={cn("inline-flex items-center gap-2.5", className)}>
			{inner}
		</Link>
	);
}
