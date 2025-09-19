"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const positionHeaders = [
	"Symbol",
	"Size",
	"ROE",
	"Entry Price",
	"Est. Exit Price",
	"Mark/Liq. Price",
	"PnL (ROE%)",
	"Margin",
	"Stops",
];

const historyHeaders = [
	"Symbol",
	"Side",
	"Size",
	"Entry Price",
	"Exit Price",
	"PnL",
	"Fee",
	"Time",
	"Status",
];

export function PositionsTable() {
	return (
		<div className="bg-[var(--trading-bg-primary)] rounded p-6">
			<Tabs defaultValue="positions" className="w-full">
				<TabsList className="bg-transparent border-b border-[var(--trading-border)] rounded-none p-0 h-auto">
					<TabsTrigger
						value="positions"
						className="bg-transparent text-[var(--trading-text-primary)] text-sm font-bold border-b-2 border-transparent data-[state=active]:border-[var(--trading-green)] data-[state=active]:text-[var(--trading-green)] rounded-none px-6 py-3"
					>
						Positions
					</TabsTrigger>
					<TabsTrigger
						value="history"
						className="bg-transparent text-[var(--trading-text-primary)] text-sm font-bold border-b-2 border-transparent data-[state=active]:border-[var(--trading-green)] data-[state=active]:text-[var(--trading-green)] rounded-none px-6 py-3"
					>
						History
					</TabsTrigger>
				</TabsList>

				<TabsContent value="positions" className="mt-6">
					<div className="grid grid-cols-9 gap-4 mb-6 pb-3 border-b border-[var(--trading-border)]">
						{positionHeaders.map((header) => (
							<div
								key={header}
								className="text-[var(--trading-text-secondary)] text-xs font-medium"
							>
								{header}
							</div>
						))}
					</div>

					<div className="flex flex-col items-center justify-center py-12">
						<div className="w-16 h-16 bg-[var(--trading-bg-secondary)] rounded-full flex items-center justify-center mb-4 mx-auto">
							<div className="w-8 h-8 bg-[var(--trading-border)] rounded"></div>
						</div>
						<p className="text-[var(--trading-text-muted)] text-sm">No open positions</p>
					</div>
				</TabsContent>

				<TabsContent value="history" className="mt-6">
					<div className="grid grid-cols-9 gap-4 mb-4 pb-2 border-b border-[var(--trading-border)]">
						{historyHeaders.map((header) => (
							<div
								key={`history-${header}`}
								className="text-[var(--trading-text-secondary)] text-xs font-medium"
							>
								{header}
							</div>
						))}
					</div>

					<div className="flex flex-col items-center justify-center py-12">
						<div className="w-16 h-16 bg-[var(--trading-bg-secondary)] rounded-full flex items-center justify-center mb-4 mx-auto">
							<div className="w-8 h-8 bg-[var(--trading-border)] rounded"></div>
						</div>
						<p className="text-[var(--trading-text-muted)] text-sm">No transaction history</p>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
