import { describe, expect, it } from "bun:test";
import type { NearMpcClient } from "@lemon/near-mpc";
import { associatedTokenAddress, TOKEN_PROGRAM_ID, USDC_MINT } from "@lemon/pacifica/deposit";
import { base58 } from "@scure/base";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createSolanaExecutor, createUsdcAccount, usdcTransfer } from "./solana";

/**
 * The instruction encoding, because nothing downstream catches an error in it.
 *
 * A wrong amount here is a transfer of the wrong size and a wrong account order
 * is a transfer to the wrong place, and both fail — if they fail at all — as an
 * opaque program error at the moment a vault's margin is being moved. These are
 * pure functions, so the encoding can be asserted directly.
 */

const OWNER = "9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY";
const DESTINATION = "72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa";
const PAYER = "PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH";

describe("usdcTransfer", () => {
	it("encodes TransferChecked with a little-endian u64 and USDC's decimals", () => {
		const instruction = usdcTransfer({ owner: OWNER, to: DESTINATION, amount: 1_500_000n });

		expect(instruction.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
		expect(instruction.data).toHaveLength(10);
		// 12 is TransferChecked; 9 is the trailing decimals byte.
		expect(instruction.data[0]).toBe(12);
		expect(instruction.data[9]).toBe(6);

		const amount = new DataView(
			instruction.data.buffer,
			instruction.data.byteOffset,
			instruction.data.byteLength,
		).getBigUint64(1, true);
		expect(amount).toBe(1_500_000n);
	});

	it("moves between the two wallets' token accounts, not the wallets", () => {
		const instruction = usdcTransfer({ owner: OWNER, to: DESTINATION, amount: 1n });
		const [source, mint, destination, signer] = instruction.keys;

		expect(source.pubkey.equals(associatedTokenAddress(new PublicKey(OWNER), USDC_MINT))).toBe(
			true,
		);
		expect(mint.pubkey.equals(USDC_MINT)).toBe(true);
		expect(
			destination.pubkey.equals(associatedTokenAddress(new PublicKey(DESTINATION), USDC_MINT)),
		).toBe(true);

		// The owner signs and is not itself written to; both token accounts are.
		expect(signer.pubkey.toBase58()).toBe(OWNER);
		expect(signer.isSigner).toBe(true);
		expect(signer.isWritable).toBe(false);
		expect(source.isWritable).toBe(true);
		expect(destination.isWritable).toBe(true);
	});

	it("carries the full u64 range, so a large transfer is not silently truncated", () => {
		const large = 18_446_744_073_709_551_615n;
		const instruction = usdcTransfer({ owner: OWNER, to: DESTINATION, amount: large });
		const view = new DataView(
			instruction.data.buffer,
			instruction.data.byteOffset,
			instruction.data.byteLength,
		);
		expect(view.getBigUint64(1, true)).toBe(large);
	});
});

describe("createUsdcAccount", () => {
	it("bills the payer and leaves the owner unsigned", () => {
		const instruction = createUsdcAccount({ payer: PAYER, owner: OWNER });
		const [payer, account, owner] = instruction.keys;

		// The whole point: a derived wallet has no SOL, so someone else pays rent
		// and the wallet that ends up owning the account signs nothing.
		expect(payer.pubkey.toBase58()).toBe(PAYER);
		expect(payer.isSigner).toBe(true);
		expect(owner.pubkey.toBase58()).toBe(OWNER);
		expect(owner.isSigner).toBe(false);

		expect(account.pubkey.equals(associatedTokenAddress(new PublicKey(OWNER), USDC_MINT))).toBe(
			true,
		);
		// `CreateIdempotent`, so this can be attached unconditionally.
		expect(Array.from(instruction.data)).toEqual([1]);
	});
});

describe("createSolanaExecutor", () => {
	const mpc = {} as NearMpcClient;
	const keypair = Keypair.generate();

	it("accepts a base58 secret key", () => {
		const executor = createSolanaExecutor({
			rpcUrl: "https://rpc.example.test",
			feePayerSecret: base58.encode(keypair.secretKey),
			mpc,
		});
		expect(executor.feePayer).toBe(keypair.publicKey.toBase58());
	});

	it("accepts the JSON byte array `solana-keygen` writes", () => {
		const executor = createSolanaExecutor({
			rpcUrl: "https://rpc.example.test",
			feePayerSecret: JSON.stringify(Array.from(keypair.secretKey)),
			mpc,
		});
		expect(executor.feePayer).toBe(keypair.publicKey.toBase58());
	});

	it("refuses an empty secret at construction rather than at the first send", () => {
		expect(() =>
			createSolanaExecutor({ rpcUrl: "https://rpc.example.test", feePayerSecret: "  ", mpc }),
		).toThrow(/SOLANA_FEE_PAYER_SECRET is empty/);
	});

	it("names the variable when the secret is malformed", () => {
		expect(() =>
			createSolanaExecutor({
				rpcUrl: "https://rpc.example.test",
				feePayerSecret: "not-a-key",
				mpc,
			}),
		).toThrow(/not a Solana secret key/);
	});
});
