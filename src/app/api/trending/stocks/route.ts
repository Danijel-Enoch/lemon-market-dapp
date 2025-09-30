/* eslint-disable @typescript-eslint/no-unused-vars */
const stocks = ["NFLX", "TSLA"];

const stocksDetails = stocks.map(async (stock) => {
	const response = await fetch(
		`https://api.diadata.org/v1/rwa/Equities/${stock}`,
		{
			method: "GET"
		}
	);

	const data = await response.json();
	return data;
});

export async function GET(req: Request) {
	return Response.json({ data: await Promise.all(stocksDetails) });
}
