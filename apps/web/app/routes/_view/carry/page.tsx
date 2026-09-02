import { CarryBuilder } from "@app/components/carry/CarryBuilder";
import { CarryPositionList } from "@app/components/carry/CarryPositionList";
import { Callout } from "@app/components/common/Callout";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Cash & Carry — Lemon Markets" },
	{
		name: "description",
		content:
			"Delta-neutral positions: hold tokenized stock spot, short the matching Avantis perp, collect funding.",
	},
];

export default function CarryPage() {
	return (
		<div className="space-y-8">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">Cash &amp; Carry</h1>
				<p className="text-sm text-gray-400">
					Buy the spot token, short the matching perp. Price moves cancel, so what is left is
					funding minus costs.
				</p>
			</header>

			<Callout tone="info" title="How this pays — and when it doesn't">
				A carry earns only when the short side of the perp <em>receives</em> funding, which happens
				when longs are crowded. When shorts are crowded the position pays funding instead. Every
				quote below shows the real sign and the round-trip cost before you commit.
			</Callout>

			<CarryBuilder />

			<section className="space-y-3">
				<h2 className="text-lg font-medium">Your positions</h2>
				<CarryPositionList />
			</section>
		</div>
	);
}
