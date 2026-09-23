import { Link } from "react-router";
import { cn } from "../utils";

/**
 * Brand lockup.
 *
 * The Firm sets its name as a heavy editorial wordmark with a monospaced
 * kicker tucked under it, and that is the shape here: the Lemon mark, the
 * name in the serif, and "MARKETS" in spaced mono on the line below. The mark
 * keeps its own corner radius — it is the one round thing in a system built
 * out of squares, because it is a logo and not a component.
 *
 * Kept as one component so the nav, the footer and the mobile bar can never
 * drift apart.
 */
export function Brand({
	size = 28,
	showWordmark = true,
	showKicker = true,
	to = "/",
	className,
}: {
	size?: number;
	showWordmark?: boolean;
	/** The mono kicker under the name. Dropped where the lockup has to be one line. */
	showKicker?: boolean;
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
				className="block shrink-0"
				style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
			/>
			{showWordmark && (
				<span className="flex min-w-0 flex-col">
					<span
						className="font-display font-extrabold leading-[0.92] tracking-[-0.045em] text-[var(--pon-fg-0)]"
						style={{ fontSize: Math.round(size * 0.86) }}
					>
						Lemon
					</span>
					{showKicker && (
						<span
							className="font-mono uppercase leading-none text-[var(--pon-fg-2)]"
							style={{
								fontSize: Math.max(7, Math.round(size * 0.27)),
								letterSpacing: "0.22em",
							}}
						>
							Markets
						</span>
					)}
				</span>
			)}
		</>
	);

	if (to === null) {
		return <span className={cn("inline-flex items-center gap-2", className)}>{inner}</span>;
	}

	return (
		<Link to={to} className={cn("inline-flex items-center gap-2", className)}>
			{inner}
		</Link>
	);
}
