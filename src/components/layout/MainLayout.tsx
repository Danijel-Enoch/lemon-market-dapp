"use client";

import type React from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
	children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
	return (
		<div className="min-h-screen bg-black text-white">
			<Header />
			<div className="flex">
				<Sidebar />
				<main className="flex-1 overflow-hidden">{children}</main>
			</div>
		</div>
	);
}
