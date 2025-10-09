"use client";

import { LiFiWidget, type WidgetConfig } from "@lifi/widget";
import { ArrowLeftRight, Clock, Info, Repeat, Shield, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BridgeSwapPage() {
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
                    <div className="space-y-6">
                        <Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-green-500" />
                                    Bridge Features
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <ArrowLeftRight className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-medium text-white">
                                            Cross-Chain Transfers
                                        </h4>
                                        <p className="text-xs text-white/60 mt-1">
                                            Seamlessly move assets between
                                            multiple blockchains
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-medium text-white">
                                            Secure Bridging
                                        </h4>
                                        <p className="text-xs text-white/60 mt-1">
                                            Powered by LiFi with best-in-class
                                            security
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Clock className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-medium text-white">
                                            Fast Execution
                                        </h4>
                                        <p className="text-xs text-white/60 mt-1">
                                            Optimized routes for quick
                                            transactions
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
                            <CardContent className="p-4">
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
                    <div className="lg:col-span-2 w-full h-full">
                        <div className="w-full h-full">
                            <LiFiWidget
                                integrator="omni-bot"
                                config={widgetConfig}
                            />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
