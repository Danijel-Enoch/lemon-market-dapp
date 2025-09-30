/* eslint-disable @typescript-eslint/no-unused-vars */
const pairs = [
	"0x16969fa79651bae11736f2f6576a86fe2726b42b",
	"0x3817ff61b34c5ff5dc89709b2db1f194299e3ba9",
	"0x3dc2878f9f60476dbbb18af7531fbe1a603c8dc0",
	"0xa1893c58a39c67f1e0f5d5ef6b8d673ef0448968"
];

const poolsDetails = pairs.map(async (pair) => {
	const response = await fetch(
		`https://api.dexscreener.com/latest/dex/pairs/${"bsc"}/${pair}`,
		{
			method: "GET"
		}
	);

	const data = await response.json();
	return data.pairs[0];
});
export async function GET(req: Request) {
	return Response.json({ data: await Promise.all(poolsDetails) });
}
