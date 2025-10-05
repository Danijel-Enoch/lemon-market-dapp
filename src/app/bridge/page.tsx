import {
	ArrowDownUp,
	Clock,
	History,
	Plus,
	Repeat,
	Wallet
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiFiWidget, WidgetConfig } from "@lifi/widget";

const networks = [
	{ id: "ethereum", name: "Ethereum", symbol: "ETH", color: "bg-blue-500" },
	{ id: "polygon", name: "Polygon", symbol: "MATIC", color: "bg-purple-500" },
	{ id: "bsc", name: "BSC", symbol: "BNB", color: "bg-yellow-500" },
	{ id: "arbitrum", name: "Arbitrum", symbol: "ARB", color: "bg-cyan-500" },
	{ id: "optimism", name: "Optimism", symbol: "OP", color: "bg-red-500" }
];

const tokens = [
	{ symbol: "ETH", name: "Ethereum", balance: "2.456", price: "$2,456.78" },
	{ symbol: "USDT", name: "Tether", balance: "1,250.00", price: "$1.00" },
	{ symbol: "USDC", name: "USD Coin", balance: "850.50", price: "$1.00" },
	{
		symbol: "WBTC",
		name: "Wrapped Bitcoin",
		balance: "0.125",
		price: "$45,234.56"
	},
	{
		symbol: "DAI",
		name: "Dai Stablecoin",
		balance: "500.00",
		price: "$1.00"
	}
];

const recentTransactions = [
	{
		id: 1,
		type: "Bridge",
		from: "Ethereum",
		to: "Polygon",
		amount: "100 USDT",
		status: "Completed",
		time: "2 mins ago",
		hash: "0x1234...5678"
	},
	{
		id: 2,
		type: "Swap",
		from: "ETH",
		to: "USDT",
		amount: "0.5 ETH",
		status: "Pending",
		time: "5 mins ago",
		hash: "0xabcd...efgh"
	},
	{
		id: 3,
		type: "Bridge",
		from: "BSC",
		to: "Ethereum",
		amount: "50 USDC",
		status: "Completed",
		time: "1 hour ago",
		hash: "0x9876...5432"
	}
];

export default function BridgeSwapPage() {
	const widgetConfig: WidgetConfig = {
		integrator: "omni-bot",
		fee: 0.02
	};
	return (
		<div className="min-h-screen bg-background">
			<Header />
			<main className="container mx-auto px-6 py-8 max-w-[1600px]">
				<div className="mb-8 flex items-center gap-3">
					<div className="p-2 bg-primary/10 rounded-lg">
						<Repeat className="w-6 h-6 text-primary" />
					</div>
					<div>
						<h1 className="text-3xl font-bold text-foreground">
							Bridge & Swap
						</h1>
						<p className="text-muted-foreground text-sm">
							Bridge tokens across chains and swap assets
						</p>
					</div>
				</div>

				<LiFiWidget integrator="omni-bot" config={widgetConfig} />
			</main>
		</div>
	);
}
