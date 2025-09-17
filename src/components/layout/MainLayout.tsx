"use client";

import type React from "react";
import { GroupsHeader } from "./GroupsHeader";
import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
	children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
	return (
		<div className="min-h-screen bg-black text-white">
			<GroupsHeader />
			<div className="flex gap-4">
				<Sidebar />
				<main className="flex-1 overflow-hidden">{children}</main>
			</div>
		</div>
	);
}
