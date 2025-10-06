"use client";

import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

export function Header() {
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navItems = [
        { href: "/trending", label: "Trending" },
        { href: "/perp", label: "Trade" },
        { href: "/bridge", label: "Bridge" },
        { href: "/staking", label: "Stake" },
    ];

    return (
        <div className="w-full p-4 md:p-8">
            <motion.header
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="max-w-screen-2xl mx-auto flex items-center justify-between rounded-xl backdrop-blur-md px-8 md:px-12 py-4 bg-[#13151b99] border border-gray-100/10"
            >
                <Link href="/" className="inline-flex items-center gap-3.5">
                    <Image
                        src="/image/logo.png"
                        alt="Lemon Markets"
                        width={39}
                        height={40}
                    />
                    <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent font-semibold text-xl">
                        Lemon Markets
                    </span>
                </Link>

                <nav className="hidden md:inline-flex items-center gap-9">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent hover:text-[#4dad31] text-sm leading-tight ${isActive ? "text-[#4dad31]" : ""}`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <ConnectWallet />

                <button
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden text-white"
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden absolute top-full left-0 right-0 mt-4 pb-4 border-t border-white/20 bg-gray-900/90 backdrop-blur-md rounded-b-lg"
                    >
                        <nav className="flex flex-col space-y-4 mt-4 px-6">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`text-white text-lg font-medium ${
                                            isActive
                                                ? "text-[#4dad31]"
                                                : "hover:text-[#4dad31]"
                                        }`}
                                        onClick={() => setIsMenuOpen(false)}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                            <ConnectWallet />
                        </nav>
                    </motion.div>
                )}
            </motion.header>
        </div>
    );
}
