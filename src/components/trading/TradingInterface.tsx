import { Header } from "../layout/Header";
import { ChartSection } from "./ChartSection";
import { PositionsTable } from "./PositionsTable";
import { TradingPairSelector } from "./TradingPairSelector";
import { TradingPanel } from "./TradingPanel";

export function TradingInterface() {
	return (
		<div className="h-screen bg-(--trading-bg-primary) flex flex-col">
			<Header />

			<div className="flex-1 flex items-start">
				<div className="flex-1 flex flex-col gap-1">
					<TradingPairSelector />
					<ChartSection fetchLatestPrice={async () => {}} isLoadingPrice={false} />

					<PositionsTable positions={[]} isLoading={false} error={null} onRefetch={() => {}} />
				</div>

				<TradingPanel />
			</div>
		</div>
	);
}
