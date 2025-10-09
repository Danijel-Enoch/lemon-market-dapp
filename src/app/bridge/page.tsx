"use client";

import {
    LiFiWidget,
    type WidgetConfig,
    useWidgetEvents,
    WidgetEvent,
} from "@lifi/widget";
import { ArrowLeftRight, Clock, Info, Repeat, Shield, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenPriceChart } from "@/components/trading/TokenPriceChart";

export default function BridgeSwapPage() {
    const [selectedToken, setSelectedToken] = useState<{
        symbol: string;
        address: string;
        chainId: number;
    } | null>(null);
    const widgetEvents = useWidgetEvents();

    useEffect(() => {
        const handleSourceTokenSelected = (data: {
            chainId: number;
            tokenAddress: string;
        }) => {
            // For now, we'll use a simple mapping. In production, you'd fetch token details from the API
            const tokenMap: Record<string, string> = {
                "0x0000000000000000000000000000000000000000": "ETH",
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "WETH",
                "0xdAC17F958D2ee523a2206206994597C13D831ec7": "USDT",
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "USDC",
            };

            const symbol = tokenMap[data.tokenAddress] || "TOKEN";
            setSelectedToken({
                symbol,
                address: data.tokenAddress,
                chainId: data.chainId,
            });
        };

        widgetEvents.on(
            WidgetEvent.SourceChainTokenSelected,
            handleSourceTokenSelected,
        );

        return () => {
            widgetEvents.off(
                WidgetEvent.SourceChainTokenSelected,
                handleSourceTokenSelected,
            );
        };
    }, [widgetEvents]);

    const widgetConfig: WidgetConfig = {
        integrator: "omni-bot",
        fee: 0.02,
        theme: {
            container: {
                boxShadow: "0 0 0 1px #333333",
                borderRadius: "12px",
            },
            palette: {
                primary: {
                    main: "#a3e635",
                },
                secondary: {
                    main: "#2d3748",
                },
                background: {
                    default: "#0a0a0a",
                    paper: "#1a1a1a",
                },
                grey: {
                    300: "#333333",
                    800: "#1a1a1a",
                },
                text: {
                    primary: "#e8eaed",
                    secondary: "#94a3b8",
                },
            },
            shape: {
                borderRadius: 8,
                borderRadiusSecondary: 12,
            },
            typography: {
                fontFamily: "var(--font-inter), Inter, sans-serif",
            },
        },
        appearance: "dark",
    };

    return (
        <div className="min-h-screen">
            <main className="container mx-auto px-6 py-8 max-w-[1600px]">
                <div className="mb-8 flex items-center gap-3">
                    <div className="p-2 bg-green-600/10 rounded-lg">
                        <Repeat className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">
                            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                                Bridge & Swap
                            </span>
                        </h1>
                        <p className="text-white/70 text-sm">
                            Bridge tokens across chains and swap assets
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6 lg:col-span-2">
                        <TokenPriceChart tokenSymbol={selectedToken?.symbol} />
                        <Card className="bg-gradient-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
                            <CardContent className="px-4">
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-white mb-2">
                                            Bridge & Swap Fees
                                        </h4>
                                        <p className="text-xs text-white/70 mb-2">
                                            A 2% protocol fee is applied to
                                            bridge and swap transactions
                                        </p>
                                        <div className="text-xs text-white/60">
                                            Additional gas fees and bridge
                                            provider fees may apply
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="flex flex-col gap-2">
                        <LiFiWidget
                            integrator="omni-bot"
                            config={widgetConfig}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
