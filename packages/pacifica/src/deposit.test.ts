import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
	anchorDiscriminator,
	associatedTokenAddress,
	buildDepositInstruction,
	createUsdcAccountIfMissing,
	MINIMUM_DEPOSIT_USDC,
	PACIFICA_CENTRAL_STATE,
	PACIFICA_PROGRAM_ID,
	PACIFICA_VAULT,
	pacificaEventAuthority,
	toUsdcBaseUnits,
	USDC_MINT,
} from "./deposit";

const depositor = new PublicKey("CU2adJQ7YSz9PhNd7Z7hEp1JAEtoGoXp3BaQZ5uNEjto");

describe("anchor encoding", () => {
	test("the deposit discriminator matches the reference SDK", () => {
		// sha256("global:deposit")[:8], as computed by pacifica-fi/python-sdk.
		expect(Buffer.from(anchorDiscriminator("deposit")).toString("hex")).toBe("f223c68952e1f2b6");
	});

	test("instruction names are case sensitive, as Anchor dispatch is", () => {
		expect(anchorDiscriminator("deposit")).not.toEqual(anchorDiscriminator("Deposit"));
	});
});

describe("usdc base units", () => {
	test("converts at six decimals", () => {
		expect(toUsdcBaseUnits(1)).toBe(1_000_000n);
		expect(toUsdcBaseUnits(4200.69)).toBe(4_200_690_000n);
	});

	test("rounds sub-unit dust rather than throwing on it", () => {
		expect(toUsdcBaseUnits(10.0000009)).toBe(10_000_001n);
	});

	test("rejects zero, negative and non-finite amounts", () => {
		expect(() => toUsdcBaseUnits(0)).toThrow("positive number");
		expect(() => toUsdcBaseUnits(-5)).toThrow("positive number");
		expect(() => toUsdcBaseUnits(Number.NaN)).toThrow("positive number");
	});

	test("rejects an amount too large to represent exactly", () => {
		expect(() => toUsdcBaseUnits(1e12)).toThrow("too large");
	});
});

describe("deposit instruction", () => {
	const instruction = buildDepositInstruction({ depositor, amount: 25 });

	test("targets Pacifica's custody program", () => {
		expect(instruction.programId.equals(PACIFICA_PROGRAM_ID)).toBe(true);
	});

	test("carries the discriminator followed by a little-endian u64 amount", () => {
		expect(instruction.data.length).toBe(16);
		expect(instruction.data.subarray(0, 8).toString("hex")).toBe("f223c68952e1f2b6");
		expect(instruction.data.readBigUInt64LE(8)).toBe(25_000_000n);
	});

	test("the depositor is the only signer — Pacifica credits whoever signs", () => {
		const signers = instruction.keys.filter((key) => key.isSigner);
		expect(signers.length).toBe(1);
		expect(signers[0].pubkey.equals(depositor)).toBe(true);
	});

	test("passes the ten accounts the program expects, in order", () => {
		expect(instruction.keys.length).toBe(10);
		expect(instruction.keys[1].pubkey.equals(associatedTokenAddress(depositor, USDC_MINT))).toBe(
			true,
		);
		expect(instruction.keys[2].pubkey.equals(PACIFICA_CENTRAL_STATE)).toBe(true);
		expect(instruction.keys[3].pubkey.equals(PACIFICA_VAULT)).toBe(true);
		expect(instruction.keys[8].pubkey.equals(pacificaEventAuthority())).toBe(true);
	});

	test("the state and vault accounts are writable", () => {
		expect(instruction.keys[2].isWritable).toBe(true);
		expect(instruction.keys[3].isWritable).toBe(true);
	});

	test("refuses an amount below Pacifica's on-chain minimum", () => {
		expect(() => buildDepositInstruction({ depositor, amount: MINIMUM_DEPOSIT_USDC - 1 })).toThrow(
			"minimum deposit",
		);
	});
});

describe("token account creation", () => {
	test("is idempotent, so it can be sent without reading the account first", () => {
		const instruction = createUsdcAccountIfMissing({ payer: depositor, owner: depositor });
		expect(instruction.data[0]).toBe(1);
	});

	test("lets a separate payer fund rent for a wallet holding no SOL", () => {
		const payer = new PublicKey("11111111111111111111111111111112");
		const instruction = createUsdcAccountIfMissing({ payer, owner: depositor });

		expect(instruction.keys[0].pubkey.equals(payer)).toBe(true);
		expect(instruction.keys[0].isSigner).toBe(true);
		// The owner never signs: rent is the payer's problem, the account is the
		// owner's. That split is what makes a freshly derived wallet fundable.
		expect(instruction.keys[2].pubkey.equals(depositor)).toBe(true);
		expect(instruction.keys[2].isSigner).toBe(false);
	});

	test("derives the same address the deposit instruction uses", () => {
		const instruction = createUsdcAccountIfMissing({ payer: depositor, owner: depositor });
		expect(instruction.keys[1].pubkey.equals(associatedTokenAddress(depositor, USDC_MINT))).toBe(
			true,
		);
	});
});
