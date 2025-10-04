"use client";

import { Lock, Repeat, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

export function Header() {
    const pathname = usePathname();

    const navItems = [
        { href: "/", label: "Trending", icon: TrendingUp },
        { href: "/perp", label: "Trade", icon: Repeat },
        { href: "/bridge", label: "Bridge", icon: Repeat },
        { href: "/staking", label: "Stake", icon: Lock },
    ];

    return (
        <header className="h-16 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-between h-full mx-auto max-w-[1600px]">
                {/* Logo */}
                <div className="flex items-center">
                    <Link
                        href="/"
                        className="text-primary font-bold text-lg tracking-tight hover:text-primary-hover transition-colors"
                    >
                        lemon-perp
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex items-center space-x-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Right Section */}
                <div className="flex items-center gap-4">
                    {/* Leaderboard */}
                    <Link
                        href="/leaderboard"
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            pathname === "/leaderboard"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                        <Trophy className="w-4 h-4" />
                        <span>Leaderboard</span>
                    </Link>

                    {/* Connect Wallet Button */}
                    <ConnectWallet />
                </div>
            </div>
        </header>
    );
}
