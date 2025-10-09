/* eslint-disable @typescript-eslint/no-unused-vars */
const stocks = ["NFLX", "TSLA"];

const stocksDetails = stocks.map(async (stock) => {
	return {};
});

export async function GET(req: Request) {
	return Response.json({ data: await Promise.all(stocksDetails) });
}
