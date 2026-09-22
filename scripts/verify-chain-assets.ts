#!/usr/bin/env bun
/**
 * Check every chain's quote asset against the chain it names.
 *
 * `CHAIN_REGISTRY` carries a `usdcStatus` of "verified" or "unverified" per
 * chain, and the distinction is load-bearing rather than documentary. The Base
 * entry was read off Base mainnet; the Arbitrum and X Layer entries were taken
 * from a list, and a wrong one there does not fail loudly — it deploys a factory
 * against a token nobody holds, or one whose decimals are not six, and every
 * balance in the app is then wrong by a factor nothing in the code can detect.
 *
 * This reads `symbol()`, `decimals()` and `totalSupply()` from each chain and
 * says whether the registry agrees. It is the thing to run before flipping an
 * entry to "verified", and the thing to run again when an RPC endpoint changes.
 *
 * The supply is printed rather than checked, and it is the interesting one. Both
 * of X Layer's two "USDC" contracts pass the symbol and decimals checks; what
 * separates them is that one holds sixteen times the other's supply. No
 * threshold can decide that automatically — a genuinely new issuance starts
 * small — so the number is put in front of a person instead.
 *
 *   bun run scripts/verify-chain-assets.ts
 *   RPC_URL_XLAYER=https://… bun run scripts/verify-chain-assets.ts
 *
 * Exits non-zero if any chain disagrees or could not be reached, so it is usable
 * as a deploy gate rather than only as something to read.
 */

import { allChains, type ChainInfo } from "@lemon/core";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { arbitrum, base, xLayer } from "viem/chains";

const DEFINITIONS = { 8453: base, 42161: arbitrum, 196: xLayer } as const;

/** The endpoint to use for a chain: its suffixed variable, else viem's public default. */
function rpcFor(info: ChainInfo): string {
	const configured = process.env[`RPC_URL_${info.envSuffix}`]?.trim();
	if (configured) return configured;
	return DEFINITIONS[info.id].rpcUrls.default.http[0];
}

type Verdict = {
	info: ChainInfo;
	ok: boolean;
	detail: string;
};

async function check(info: ChainInfo): Promise<Verdict> {
	const rpc = rpcFor(info);
	const client = createPublicClient({ chain: DEFINITIONS[info.id], transport: http(rpc) });

	try {
		const [symbol, decimals, totalSupply] = await Promise.all([
			client.readContract({ abi: erc20Abi, address: info.usdc, functionName: "symbol", args: [] }),
			client.readContract({
				abi: erc20Abi,
				address: info.usdc,
				functionName: "decimals",
				args: [],
			}),
			/**
			 * Reported, never judged.
			 *
			 * This is the field that separates a chain's real USDC from a lookalike
			 * when both answer `symbol()` and `decimals()` correctly — which is not
			 * hypothetical: X Layer carries two such contracts, and the one with a
			 * sixteenth of the supply is the wrong one. There is no threshold that
			 * makes that a pass/fail check, because a genuinely new deployment
			 * starts small. So it is printed for a person to weigh, which is the
			 * same reason this script will not flip an entry to "verified" itself.
			 */
			client.readContract({
				abi: erc20Abi,
				address: info.usdc,
				functionName: "totalSupply",
				args: [],
			}),
		]);

		const problems: string[] = [];
		// Not an equality check against "USDC": bridged issuances are legitimately
		// called USDC.e, USDC.b and similar, and rejecting those would fail a
		// correct configuration. What must not pass is a token that is not a
		// dollar stablecoin at all.
		if (!/usdc/i.test(symbol)) {
			problems.push(`symbol() is "${symbol}", which does not look like any USDC`);
		}
		if (decimals !== info.usdcDecimals) {
			problems.push(
				`decimals() is ${decimals}, not ${info.usdcDecimals} — every amount in this app would be wrong by 10^${Math.abs(decimals - info.usdcDecimals)}`,
			);
		}

		if (problems.length > 0) {
			return { info, ok: false, detail: problems.join("; ") };
		}
		const supply = Number(formatUnits(totalSupply, decimals)).toLocaleString(undefined, {
			maximumFractionDigits: 0,
		});

		return {
			info,
			ok: true,
			detail: `${symbol}, ${decimals} decimals, supply ${supply}${
				info.usdcStatus === "unverified"
					? " — registry still says unverified; these two fields check out, the supply is for you to weigh"
					: ""
			}`,
		};
	} catch (error) {
		// Unreachable is not the same as wrong, and is reported as its own thing:
		// a failed RPC call says nothing about the address.
		return {
			info,
			ok: false,
			detail: `could not be read over ${rpc}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

const verdicts = await Promise.all(allChains().map(check));

for (const { info, ok, detail } of verdicts) {
	const mark = ok ? "ok  " : "FAIL";
	console.log(`${mark} ${info.name.padEnd(14)} ${info.usdc}  ${detail}`);
}

const failed = verdicts.filter((v) => !v.ok);
const unverified = verdicts.filter((v) => v.ok && v.info.usdcStatus === "unverified");

console.log();
if (failed.length > 0) {
	console.log(
		`${failed.length} chain(s) did not check out. Fix the address in packages/core/src/chain.ts, or the RPC endpoint, before deploying against them.`,
	);
	process.exit(1);
}

if (unverified.length > 0) {
	console.log(
		`Every asset checks out. ${unverified.length} entr(ies) are still marked "unverified" in packages/core/src/chain.ts — ${unverified
			.map((v) => v.info.name)
			.join(
				", ",
			)}. Flipping them to "verified" is a deliberate edit, not something this script does: the claim is that a person looked at the token, not that a script read two fields from it.`,
	);
} else {
	console.log("Every asset checks out and every entry is marked verified.");
}
