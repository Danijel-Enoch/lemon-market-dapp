"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tableHeaders = [
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

export function PositionsTable() {
	return (
		<div className="bg-[#0a0b17] rounded p-6">
			<Tabs defaultValue="positions" className="w-full">
				<TabsList className="bg-transparent border-b border-[#282b3c] rounded-none p-0 h-auto">
					<TabsTrigger
						value="positions"
						className="bg-transparent text-[#bbbbbe] text-[14px] font-bold border-b-2 border-transparent data-[state=active]:border-[#41c6b2] data-[state=active]:text-[#41c6b2] rounded-none px-6 py-3"
					>
						Open Positions
					</TabsTrigger>
					<TabsTrigger
						value="history"
						className="bg-transparent text-[#bbbbbe] text-[14px] font-bold border-b-2 border-transparent data-[state=active]:border-[#41c6b2] data-[state=active]:text-[#41c6b2] rounded-none px-6 py-3"
					>
						Transaction History
					</TabsTrigger>
				</TabsList>

				<TabsContent value="positions" className="mt-6">
					{/* Table Header */}
					<div className="grid grid-cols-9 gap-4 mb-6 pb-3 border-b border-[#282b3c]">
						{tableHeaders.map((header) => (
							<div key={header} className="text-[#8a8d91] text-[12px] font-medium">
								{header}
							</div>
						))}
					</div>

					{/* Empty State */}
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<div className="w-16 h-16 bg-[#141623] rounded-full flex items-center justify-center mb-4 mx-auto">
								<div className="w-8 h-8 bg-[#282b3c] rounded"></div>
							</div>
							<p className="text-[#6b7280] text-[14px]">No open positions</p>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="history" className="mt-4">
					{/* Table Header */}
					<div className="grid grid-cols-9 gap-4 mb-4 pb-2 border-b border-[#282b3c]">
						{tableHeaders.map((header) => (
							<div key={`history-${header}`} className="text-[#8a8d91] text-[11px] font-medium">
								{header}
							</div>
						))}
					</div>

					{/* Empty State */}
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<div className="w-16 h-16 bg-[#141623] rounded-full flex items-center justify-center mb-4 mx-auto">
								<div className="w-8 h-8 bg-[#282b3c] rounded"></div>
							</div>
							<p className="text-[#6b7280] text-[14px]">No transaction history</p>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
