import { Callout } from "@app/components/common/Callout";
import { Skeleton } from "@app/components/ui/skeleton";
import { useSpotTokens } from "@app/hooks/useMarketData";
import { Link, type MetaFunction, Navigate, useParams } from "react-router";

export const meta: MetaFunction = ({ params }) => [{ title: `${params.symbol} — Lemon Markets` }];

/**
 * Legacy per-token spot route.
 *
 * Spot and perp share one terminal now, so this resolves the token to its
 * market and forwards there — old links keep working instead of 404ing.
 */
export default function SpotSymbolRedirect() {
	const { symbol } = useParams();
	const { data, isLoading } = useSpotTokens();

	if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

	const token = data?.tokens.find(
		(candidate) => candidate.symbol.toLowerCase() === String(symbol).toLowerCase(),
	);

	if (!token?.perpSymbol) {
		return (
			<Callout tone="warning" title="Token not found">
				<p>
					No market matches \u201C{symbol}\u201D.{" "}
					<Link to="/trade" className="underline">
						Open the trade terminal
					</Link>
					.
				</p>
			</Callout>
		);
	}

	return <Navigate to={`/trade/${token.perpSymbol.replace("/", "-")}`} replace />;
}
