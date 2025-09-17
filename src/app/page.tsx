import { TradingInterface } from "@/components/trading/TradingInterface";
import { AppProvider } from "@/contexts/AppContext";

export default function Home() {
	return (
		<AppProvider>
			<TradingInterface />
		</AppProvider>
	);
}
