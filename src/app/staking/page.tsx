import { Lock } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StakingPage() {
    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="container mx-auto px-6 py-8 max-w-[1600px]">
                <div className="mb-8 flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            Staking
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Stake your tokens to earn rewards
                        </p>
                    </div>
                </div>

                <Card className="max-w-2xl mx-auto">
                    <CardContent className="p-12 text-center">
                        <div className="mb-6">
                            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-foreground mb-2">
                                Staking Coming Soon
                            </h2>
                            <p className="text-muted-foreground">
                                Contact dev to stake your tokens and earn
                                rewards
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
