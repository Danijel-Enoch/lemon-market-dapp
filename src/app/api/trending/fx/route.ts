/* eslint-disable @typescript-eslint/no-unused-vars */
const fxPairs = ["AUD-USD", "CNY-USD", "NGN-USD"];

const fxDetails = fxPairs.map(async (pair) => {
	// const response = await fetch(
	// 	`https://api.diadata.org/v1/rwa/Fiat/${pair}`,
	// 	{
	// 		method: "GET"
	// 	}
	// );

	// const data = await response.json();
	return {};
});

export async function GET(req: Request) {
	return Response.json({ data: await Promise.all(fxDetails) });
}
