import {
    ArrowDownUp,
    Clock,
    History,
    Plus,
    Repeat,
    Wallet,
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
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const networks = [
    { id: "ethereum", name: "Ethereum", symbol: "ETH", color: "bg-blue-500" },
    { id: "polygon", name: "Polygon", symbol: "MATIC", color: "bg-purple-500" },
    { id: "bsc", name: "BSC", symbol: "BNB", color: "bg-yellow-500" },
    { id: "arbitrum", name: "Arbitrum", symbol: "ARB", color: "bg-cyan-500" },
    { id: "optimism", name: "Optimism", symbol: "OP", color: "bg-red-500" },
];

const tokens = [
    { symbol: "ETH", name: "Ethereum", balance: "2.456", price: "$2,456.78" },
    { symbol: "USDT", name: "Tether", balance: "1,250.00", price: "$1.00" },
    { symbol: "USDC", name: "USD Coin", balance: "850.50", price: "$1.00" },
    {
        symbol: "WBTC",
        name: "Wrapped Bitcoin",
        balance: "0.125",
        price: "$45,234.56",
    },
    {
        symbol: "DAI",
        name: "Dai Stablecoin",
        balance: "500.00",
        price: "$1.00",
    },
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
        hash: "0x1234...5678",
    },
    {
        id: 2,
        type: "Swap",
        from: "ETH",
        to: "USDT",
        amount: "0.5 ETH",
        status: "Pending",
        time: "5 mins ago",
        hash: "0xabcd...efgh",
    },
    {
        id: 3,
        type: "Bridge",
        from: "BSC",
        to: "Ethereum",
        amount: "50 USDC",
        status: "Completed",
        time: "1 hour ago",
        hash: "0x9876...5432",
    },
];

export default function BridgeSwapPage() {
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader className="border-b border-border">
                                <Tabs defaultValue="swap" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="swap">
                                            Swap
                                        </TabsTrigger>
                                        <TabsTrigger value="bridge">
                                            Bridge
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </CardHeader>
                            <CardContent className="p-6">
                                <Tabs defaultValue="swap" className="w-full">
                                    <TabsContent
                                        value="swap"
                                        className="space-y-6 mt-0"
                                    >
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-muted-foreground">
                                                    From
                                                </label>
                                                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <Select>
                                                            <SelectTrigger className="w-40">
                                                                <SelectValue placeholder="ETH" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {tokens.map(
                                                                    (token) => (
                                                                        <SelectItem
                                                                            key={
                                                                                token.symbol
                                                                            }
                                                                            value={
                                                                                token.symbol
                                                                            }
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-bold">
                                                                                    {
                                                                                        token
                                                                                            .symbol[0]
                                                                                    }
                                                                                </div>
                                                                                <span>
                                                                                    {
                                                                                        token.symbol
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground">
                                                                Balance: 2.456
                                                                ETH
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Input
                                                        placeholder="0.0"
                                                        className="text-2xl bg-transparent border-none p-0 h-auto font-bold"
                                                    />
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        ≈ $2,456.78
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-center -my-2">
                                                <button className="p-2 bg-card border-2 border-border rounded-full hover:border-primary transition-colors">
                                                    <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-muted-foreground">
                                                    To
                                                </label>
                                                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <Select>
                                                            <SelectTrigger className="w-40">
                                                                <SelectValue placeholder="USDT" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {tokens.map(
                                                                    (token) => (
                                                                        <SelectItem
                                                                            key={
                                                                                token.symbol
                                                                            }
                                                                            value={
                                                                                token.symbol
                                                                            }
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-bold">
                                                                                    {
                                                                                        token
                                                                                            .symbol[0]
                                                                                    }
                                                                                </div>
                                                                                <span>
                                                                                    {
                                                                                        token.symbol
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground">
                                                                Balance:
                                                                1,250.00 USDT
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-2xl font-bold">
                                                        2,456.78
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        ≈ $2,456.78
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm border border-border">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Exchange Rate:
                                                    </span>
                                                    <span className="font-medium">
                                                        1 ETH = 2,456.78 USDT
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Price Impact:
                                                    </span>
                                                    <span className="text-success">
                                                        &lt; 0.01%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Slippage:
                                                    </span>
                                                    <span className="font-medium">
                                                        0.5%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Network Fee:
                                                    </span>
                                                    <span className="font-medium">
                                                        ~$12.50
                                                    </span>
                                                </div>
                                            </div>

                                            <Button className="w-full h-12 text-base">
                                                Swap Tokens
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value="bridge"
                                        className="space-y-6 mt-0"
                                    >
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-muted-foreground">
                                                    From Network
                                                </label>
                                                <Select>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select network" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {networks.map(
                                                            (network) => (
                                                                <SelectItem
                                                                    key={
                                                                        network.id
                                                                    }
                                                                    value={
                                                                        network.id
                                                                    }
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            className={`w-3 h-3 rounded-full ${network.color}`}
                                                                        ></div>
                                                                        <span>
                                                                            {
                                                                                network.name
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-muted-foreground">
                                                    To Network
                                                </label>
                                                <Select>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select network" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {networks.map(
                                                            (network) => (
                                                                <SelectItem
                                                                    key={
                                                                        network.id
                                                                    }
                                                                    value={
                                                                        network.id
                                                                    }
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            className={`w-3 h-3 rounded-full ${network.color}`}
                                                                        ></div>
                                                                        <span>
                                                                            {
                                                                                network.name
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-muted-foreground">
                                                    Token & Amount
                                                </label>
                                                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <Select>
                                                            <SelectTrigger className="w-40">
                                                                <SelectValue placeholder="USDT" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {tokens.map(
                                                                    (token) => (
                                                                        <SelectItem
                                                                            key={
                                                                                token.symbol
                                                                            }
                                                                            value={
                                                                                token.symbol
                                                                            }
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-bold">
                                                                                    {
                                                                                        token
                                                                                            .symbol[0]
                                                                                    }
                                                                                </div>
                                                                                <span>
                                                                                    {
                                                                                        token.symbol
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground">
                                                                Balance:
                                                                1,250.00 USDT
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Input
                                                        placeholder="0.0"
                                                        className="text-2xl bg-transparent border-none p-0 h-auto font-bold"
                                                    />
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        ≈ $100.00
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm border border-border">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Bridge Fee:
                                                    </span>
                                                    <span className="font-medium">
                                                        $5.00
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Network Fee:
                                                    </span>
                                                    <span className="font-medium">
                                                        ~$15.00
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Estimated Time:
                                                    </span>
                                                    <span className="font-medium">
                                                        5-10 minutes
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        You&apos;ll Receive:
                                                    </span>
                                                    <span className="font-medium">
                                                        ~95.00 USDT
                                                    </span>
                                                </div>
                                            </div>

                                            <Button className="w-full h-12 text-base">
                                                Bridge Tokens
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="border-b border-border">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Wallet className="w-4 h-4" />
                                    Portfolio
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {tokens.slice(0, 4).map((token) => (
                                    <div
                                        key={token.symbol}
                                        className="flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center font-bold text-sm border border-primary/40">
                                                {token.symbol[0]}
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">
                                                    {token.symbol}
                                                </div>
                                                <div className="text-muted-foreground text-xs">
                                                    {token.name}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-sm">
                                                {token.balance}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                {token.price}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="border-b border-border">
                                <CardTitle className="text-base">
                                    Quick Actions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-2">
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    size="sm"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Token
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    size="sm"
                                >
                                    <History className="w-4 h-4 mr-2" />
                                    Transaction History
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    size="sm"
                                >
                                    <Clock className="w-4 h-4 mr-2" />
                                    Bridge Settings
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Card className="mt-8">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="text-base flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Recent Transactions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            Type
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            From
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            To
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            Amount
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            Status
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            Time
                                        </th>
                                        <th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase">
                                            Hash
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTransactions.map((tx) => (
                                        <tr
                                            key={tx.id}
                                            className="border-b border-border hover:bg-card-hover transition-colors"
                                        >
                                            <td className="p-3">
                                                <Badge
                                                    variant="outline"
                                                    className="border-primary/30 text-primary"
                                                >
                                                    {tx.type}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-sm">
                                                {tx.from}
                                            </td>
                                            <td className="p-3 text-sm">
                                                {tx.to}
                                            </td>
                                            <td className="p-3 text-sm font-medium">
                                                {tx.amount}
                                            </td>
                                            <td className="p-3">
                                                <Badge
                                                    className={
                                                        tx.status ===
                                                        "Completed"
                                                            ? "bg-success/10 text-success border-success/20"
                                                            : "bg-warning/10 text-warning border-warning/20"
                                                    }
                                                >
                                                    {tx.status}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-muted-foreground text-sm">
                                                {tx.time}
                                            </td>
                                            <td className="p-3">
                                                <button className="text-primary hover:text-primary-hover font-mono text-xs">
                                                    {tx.hash}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
