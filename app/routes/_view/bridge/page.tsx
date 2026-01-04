import { Card, CardContent } from "@app/components/ui/card";
import { ArrowRightLeft, Info } from "lucide-react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
	return [
		{ title: "Bridge & Swap - Lemon Markets" },
		{ name: "description", content: "Bridge and swap tokens across chains" },
	];
};

export default function BridgeSwapPage() {
	return (
		<div className="min-h-screen w-full mt-8">
			<div className="w-full">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-bold text-foreground">Bridge & Swap</h1>
						<p className="text-muted-foreground text-xs">
							Bridge tokens across chains and swap assets
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
					<Card className="bg-card border-gray-100/10">
						<CardContent className="flex flex-col items-center justify-center py-16">
							<div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
								<ArrowRightLeft className="w-10 h-10 text-primary" />
							</div>
							<h2 className="text-2xl font-bold text-foreground mb-2">Coming Soon</h2>
							<p className="text-muted-foreground text-center max-w-md">
								Cross-chain bridging and token swaps are coming soon. Stay tuned for seamless
								multi-chain trading capabilities.
							</p>
						</CardContent>
					</Card>

					<Card className="bg-linear-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
						<CardContent className="px-4">
							<div className="flex items-start gap-3">
								<Info className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
								<div>
									<h4 className="text-sm font-semibold text-white mb-2">What to Expect</h4>
									<ul className="text-xs text-white/70 space-y-1">
										<li>• Bridge tokens between Base, Ethereum, and more</li>
										<li>• Swap any token with competitive rates</li>
										<li>• Low fees and fast execution</li>
									</ul>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
