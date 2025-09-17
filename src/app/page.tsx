import { MainLayout } from "@/components/layout/MainLayout";
import { TradingInterface } from "@/components/trading/TradingInterface";
import { AppProvider } from "@/contexts/AppContext";

export default function Home() {
	return (
		<AppProvider>
			<MainLayout>
				<TradingInterface />
			</MainLayout>
		</AppProvider>
	);
}
