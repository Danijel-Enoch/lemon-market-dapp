import { spotApi } from "@app/lib/api";
import { erc20Abi } from "@app/lib/erc20";
import { signServerTypedData } from "@app/lib/sign-typed-data";
import { readContract, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { useCallback, useState } from "react";
import { useConfig, useConnection } from "wagmi";

export type LimitStage = "idle" | "preparing" | "approving" | "signing" | "submitting";

/**
 * Spot limit orders via KyberSwap's off-chain orderbook.
 *
 * The maker signs an EIP-712 order — no gas — and it rests until a taker fills
 * it on-chain. Worth being explicit with users: a resting order is not a
 * guarantee. On the thinner tokenized-stock pools it can sit unfilled
 * indefinitely, which is how limit orders work rather than a failure.
 */
export function useSpotLimitOrder() {
	const config = useConfig();
	const { address } = useConnection();
	const [stage, setStage] = useState<LimitStage>("idle");

	const place = useCallback(
		async (params: {
			symbol: string;
			direction: "buy" | "sell";
			shares: string;
			limitPrice: string;
			/** Hours until the order expires. */
			expiresInHours: number;
		}) => {
			if (!address) throw new Error("Connect a wallet first.");

			try {
				setStage("preparing");
				const expiredAt = Math.floor(Date.now() / 1000) + params.expiresInHours * 3600;

				const { input, signMessage } = await spotApi.limitSignMessage({
					maker: address,
					symbol: params.symbol,
					direction: params.direction,
					shares: params.shares,
					limitPrice: params.limitPrice,
					expiredAt,
				});

				// The limit-order contract must be approved for the total across
				// ALL open orders, not just this one — approving only the new
				// amount leaves previously placed orders unfillable.
				const makerAsset = input.makerAsset as `0x${string}`;
				const makingAmount = BigInt(input.makingAmount as string);
				const spender = (await spotApi.limitContract()).address;

				const allowance = (await readContract(config, {
					address: makerAsset,
					abi: erc20Abi,
					functionName: "allowance",
					args: [address, spender],
				})) as bigint;

				const active = await spotApi
					.requiredAllowance({ maker: address, symbol: params.symbol })
					.then((result) => BigInt(result.activeMakingAmount))
					.catch(() => 0n);

				const required = active + makingAmount;
				if (allowance < required) {
					setStage("approving");
					const hash = await writeContract(config, {
						address: makerAsset,
						abi: erc20Abi,
						functionName: "approve",
						args: [spender, required],
					});
					await waitForTransactionReceipt(config, { hash });
				}

				setStage("signing");
				const primaryType = signMessage.primaryType ?? "Order";
				const signature = await signServerTypedData(config, {
					domain: signMessage.domain,
					types: signMessage.types,
					primaryType,
					message: signMessage.message,
				});

				setStage("submitting");
				return await spotApi.submitLimitOrder({
					input,
					salt: signMessage.message.salt,
					signature,
				});
			} finally {
				setStage("idle");
			}
		},
		[address, config],
	);

	/** Gasless cancel — revokes the operator's co-signature rather than touching chain. */
	const cancel = useCallback(
		async (orderIds: number[]) => {
			if (!address) throw new Error("Connect a wallet first.");
			try {
				setStage("preparing");
				const message = await spotApi.cancelLimitSign({ maker: address, orderIds });

				setStage("signing");
				const signature = await signServerTypedData(config, {
					domain: message.domain,
					types: message.types,
					primaryType: message.primaryType ?? "CancelOrder",
					message: message.message,
				});

				setStage("submitting");
				return await spotApi.cancelLimit({ maker: address, orderIds, signature });
			} finally {
				setStage("idle");
			}
		},
		[address, config],
	);

	return { place, cancel, stage, isBusy: stage !== "idle" };
}
