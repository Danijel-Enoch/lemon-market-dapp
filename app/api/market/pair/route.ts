import { NextResponse } from "next/server";
import { fetchPairFromDexScreener } from "@/lib/market-data-service";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const chain = url.searchParams.get('chain') || 'base';
        const pairAddress = url.searchParams.get('pairAddress');

        if (!pairAddress) {
            return NextResponse.json({ success: false, error: 'Missing pairAddress' }, { status: 400 });
        }

        const pair = await fetchPairFromDexScreener(pairAddress, chain);
        if (!pair) {
            return NextResponse.json({ success: false, error: 'No pair data returned' }, { status: 404 });
        }

        return NextResponse.json({ success: true, pair }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
