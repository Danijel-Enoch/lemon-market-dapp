import { LiFiWidget, type WidgetConfig } from "@lifi/widget";
import {
    ArrowDownUp,
    Clock,
    History,
    Plus,
    Repeat,
    Wallet,
} from "lucide-react";
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

export default function BridgeSwapPage() {
    const widgetConfig: WidgetConfig = {
        integrator: "omni-bot",
        fee: 0.02,
    };
    return (
        <div className="min-h-screen">
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
