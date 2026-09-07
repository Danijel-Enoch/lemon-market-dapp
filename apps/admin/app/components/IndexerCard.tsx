import type { IndexerHealth } from "@lemon/client";
import { cn } from "@lemon/ui";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

/**
 * Whether the read model can be believed.
 *
 * At the top of the console and always visible, including when everything is
 * fine — which is unusual for a status widget and is the point. The indexer's
 * failure mode is silence: it does not crash and it does not 500, it answers
 * every request with `200 []`. An operator looking at an empty board cannot tell
 * a protocol nobody has deposited into from an indexer that has quietly stopped,
 * and every other figure on this page is downstream of that distinction. A card
 * that only appeared on failure would leave the healthy case looking exactly
 * like the case where the card had failed to render.
 *
 * The state that earns its place is `incomplete`: the indexer has finished, is
 * answering happily, and holds fewer vaults than the factory has created. That
 * is not lag and no amount of waiting fixes it — it means a stale schema, or a
 * start block set after a vault was deployed, or an indexer pointed at a
 * different factory. All three present as an empty board and none of them
 * announce themselves.
 */
export function IndexerCard({ health }: { health: IndexerHealth | undefined }) {
	if (!health) {
		return (
			<div className="flex items-center gap-2.5 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-5 py-4 text-sm text-[var(--pon-fg-3)]">
				<Loader2 className="size-4 animate-spin" />
				Checking the indexer…
			</div>
		);
	}

	const look = LOOKS[health.state];
	const Icon = look.icon;

	return (
		<div
			className={cn(
				"rounded-[var(--pon-r-lg,16px)] border px-5 py-4",
				look.border,
				look.background,
			)}
		>
			<div className="flex flex-wrap items-start gap-3">
				<Icon className={cn("mt-0.5 size-4 shrink-0", look.icons, look.spin && "animate-spin")} />

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<h2 className="text-sm font-medium text-[var(--pon-fg-0)]">Indexer</h2>
						<span className={cn("text-sm font-medium", look.icons)}>{look.label}</span>
					</div>

					<p className="mt-1 text-sm text-[var(--pon-fg-2)]">{health.summary}</p>

					{/* The remedy is the half an operator actually needs at 3am, so it is
					    printed rather than left to be inferred from the state. */}
					{health.remedy && <p className="mt-1 text-xs text-[var(--pon-fg-3)]">{health.remedy}</p>}

					<dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
						<Figure label="Indexed block" value={blockLabel(health.indexedBlock)} />
						<Figure label="Chain head" value={blockLabel(health.headBlock)} />
						<Figure
							label="Behind"
							value={
								health.blocksBehind === null
									? "—"
									: `${health.blocksBehind.toLocaleString()} block${health.blocksBehind === 1 ? "" : "s"}`
							}
							// Zero blocks behind is the good case and should not be shouted
							// about; anything else is worth the eye landing on it.
							tone={health.blocksBehind && health.blocksBehind > 0 ? "attention" : "neutral"}
						/>
						<Figure
							label="Vaults"
							value={vaultsLabel(health.vaults)}
							// Only a genuine shortfall is flagged. An unknown expected count
							// means the chain could not be asked, which is not a mismatch.
							tone={
								health.vaults.indexed !== null &&
								health.vaults.expected !== null &&
								health.vaults.indexed < health.vaults.expected
									? "attention"
									: "neutral"
							}
						/>
					</dl>
				</div>
			</div>
		</div>
	);
}

function Figure({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: string;
	tone?: "neutral" | "attention";
}) {
	return (
		<div>
			<dt className="text-[var(--pon-fg-4)]">{label}</dt>
			<dd
				className={cn(
					"mt-0.5 tabular-nums",
					tone === "attention" ? "text-[var(--pon-amber)]" : "text-[var(--pon-fg-0)]",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

/** An em dash rather than a zero: "we could not ask" is not "the answer is nought". */
function blockLabel(block: number | null): string {
	return block === null ? "—" : block.toLocaleString();
}

function vaultsLabel(vaults: IndexerHealth["vaults"]): string {
	if (vaults.indexed === null) return "—";
	if (vaults.expected === null) return String(vaults.indexed);
	return `${vaults.indexed} of ${vaults.expected}`;
}

const LOOKS: Record<
	IndexerHealth["state"],
	{
		label: string;
		icon: typeof CheckCircle2;
		icons: string;
		border: string;
		background: string;
		spin?: boolean;
	}
> = {
	synced: {
		label: "in sync",
		icon: CheckCircle2,
		icons: "text-[var(--pon-up)]",
		border: "border-[var(--pon-line)]",
		background: "bg-[var(--pon-bg-2)]",
	},
	backfilling: {
		label: "catching up",
		icon: Loader2,
		icons: "text-[var(--pon-fg-2)]",
		border: "border-[var(--pon-line)]",
		background: "bg-[var(--pon-bg-2)]",
		spin: true,
	},
	behind: {
		label: "behind the chain",
		icon: AlertTriangle,
		icons: "text-[var(--pon-amber)]",
		border: "border-[var(--pon-amber)]/30",
		background: "bg-[var(--pon-amber)]/10",
	},
	// Loud on purpose. This is the one that looks fine from every other angle.
	incomplete: {
		label: "missing vaults",
		icon: AlertTriangle,
		icons: "text-[var(--pon-down)]",
		border: "border-[var(--pon-down)]/30",
		background: "bg-[var(--pon-down)]/10",
	},
	unreachable: {
		label: "not answering",
		icon: XCircle,
		icons: "text-[var(--pon-down)]",
		border: "border-[var(--pon-down)]/30",
		background: "bg-[var(--pon-down)]/10",
	},
};
