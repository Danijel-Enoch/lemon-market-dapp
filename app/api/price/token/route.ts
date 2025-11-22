import { NextResponse } from "next/server";
import { getTokenPriceService } from "@/lib/token-price-service";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const tokenAddress = url.searchParams.get('tokenAddress');
        const chainParam = url.searchParams.get('chain') || 'base';

        if (!tokenAddress) {
            return NextResponse.json({ success: false, error: 'Missing tokenAddress' }, { status: 400 });
        }

        const tokenPriceService = getTokenPriceService();

        const priceData = await tokenPriceService.getTokenPriceWithAddress(tokenAddress);

        if (!priceData || (!priceData.data?.bestPriceUSD && !priceData.data?.averagePrice)) {
            return NextResponse.json({ success: false, error: 'No price data' }, { status: 404 });
        }

        // Return the most relevant USD price
        const usdPrice =
            priceData.data?.bestPriceUSD?.priceUSD || priceData.data?.bestPriceUSD?.price || priceData.data?.averagePrice || null;

        return NextResponse.json({ success: true, priceUsd: usdPrice, raw: priceData }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
