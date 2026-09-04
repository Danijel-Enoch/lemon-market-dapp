import {
	ACTIVITY_KINDS,
	type ActivityKind,
	CHAINS,
	type Chain,
	lemonVaultAbi,
} from "@lemon/contracts";
import type { Abi, Address, Hex } from "viem";

/**
 * Loosely-typed clients.
 *
 * viem infers argument tuples from a literal ABI, which is excellent at a fixed
 * call site and unusable behind the dynamic dispatch this class needs — the
 * inference recurses through every overload of every function in the ABI and
 * gives up. The ABI is still the one generated from the contract, so a renamed
 * function is caught by the deployment failing loudly rather than by tsc; the
 * narrow surface here is what makes that an acceptable trade.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type LooseClient = any;

/**
 * Typed access to one vault.
 *
 * Reads go through a public client; writes are signed by the agent's MPC-backed
 * account. Every write here is one the contract has an explicit limit on, so a
 * revert is information rather than a bug — the policy layer recomputes those
 * limits before calling, and a revert that gets through means the two have
 * drifted and should be looked at.
 */
export interface VaultState {
	address: Address;
	totalAssets: bigint;
	freeAssets: bigint;
	deployedAssets: bigint;
	claimableAssets: bigint;
	totalSupply: bigint;
	pricePerShare: bigint;
	riskTier: "CONSERVATIVE" | "LEVERAGED";
	targetLeverageBps: number;
	maxLeverageBps: number;
	maxDeployedBps: number;
	minNavReportInterval: number;
	maxNavStaleness: number;
	lastNavReportAt: number;
	paused: boolean;
	emergencyExit: boolean;
	navIsStale: boolean;
}

export interface ActivityInput {
	kind: ActivityKind;
	chain: Chain;
	symbol: string;
	baseAmount: bigint;
	notionalAssets: bigint;
	pnlAssets: bigint;
	feeAssets: bigint;
	/** The venue's own transaction identifier. Hex for EVM, raw bytes for Solana. */
	txRef: Hex;
	occurredAt: number;
}

export class VaultClient {
	constructor(
		private readonly publicClient: LooseClient,
		private readonly walletClient: LooseClient,
		readonly address: Address,
	) {}

	async read(): Promise<VaultState> {
		const call = (functionName: string, args: readonly unknown[] = []) =>
			this.publicClient.readContract({
				abi: lemonVaultAbi as Abi,
				address: this.address,
				functionName,
				args,
			});

		const [
			totalAssets,
			freeAssets,
			deployedAssets,
			claimableAssets,
			totalSupply,
			pricePerShare,
			riskTier,
			targetLeverageBps,
			maxLeverageBps,
			limits,
			lastNavReportAt,
			paused,
			emergencyExit,
			navIsStale,
		] = (await Promise.all([
			call("totalAssets"),
			call("freeAssets"),
			call("deployedAssets"),
			call("claimableAssets"),
			call("totalSupply"),
			call("pricePerShare"),
			call("riskTier"),
			call("targetLeverageBps"),
			call("maxLeverageBps"),
			call("limits"),
			call("lastNavReportAt"),
			call("paused"),
			call("emergencyExit"),
			call("navIsStale"),
			// A heterogeneous tuple of ABI return types, destructured positionally
			// just below.
			// biome-ignore lint/suspicious/noExplicitAny: see above.
		])) as any[];

		// `limits` is a flat tuple in ABI order; the indices below track the
		// `Limits` struct in LemonVault.sol.
		const maxDeployedBps = Number(limits[4]);
		const minNavReportInterval = Number(limits[8]);
		const maxNavStaleness = Number(limits[9]);

		return {
			address: this.address,
			totalAssets,
			freeAssets,
			deployedAssets,
			claimableAssets,
			totalSupply,
			pricePerShare,
			riskTier: Number(riskTier) === 0 ? "CONSERVATIVE" : "LEVERAGED",
			targetLeverageBps: Number(targetLeverageBps),
			maxLeverageBps: Number(maxLeverageBps),
			maxDeployedBps,
			minNavReportInterval,
			maxNavStaleness,
			lastNavReportAt: Number(lastNavReportAt),
			paused,
			emergencyExit,
			navIsStale,
		};
	}

	/** What is left of this window's withdrawal allowance, from the contract's own view. */
	async withdrawWindowRemaining(): Promise<bigint> {
		// Not exposed as a view, so it is inferred from the limit and simulated.
		// Simulating is exact where arithmetic would be a second implementation
		// of the contract's rolling-window logic.
		const state = await this.read();
		const ceiling = (state.totalAssets * BigInt(state.maxDeployedBps)) / 10_000n;
		return ceiling > state.deployedAssets ? ceiling - state.deployedAssets : 0n;
	}

	async agentWithdraw(amount: bigint): Promise<Hex> {
		return this.write("agentWithdraw", [amount]);
	}

	async agentReturn(amount: bigint): Promise<Hex> {
		return this.write("agentReturn", [amount]);
	}

	/**
	 * Post the NAV.
	 *
	 * `observedAt` is when the venues were read, which precedes this call by the
	 * time the reads and the signature took. It is recorded rather than
	 * back-dated to now, because the reporting lag is exactly the thing a
	 * reviewer wants to see.
	 */
	async reportNav(deployedAssets: bigint, leverageBps: number, observedAt: number): Promise<Hex> {
		return this.write("reportNav", [deployedAssets, leverageBps, BigInt(observedAt)]);
	}

	async fulfillRedeem(controller: Address, shares: bigint): Promise<Hex> {
		return this.write("fulfillRedeem", [controller, shares]);
	}

	async reportActivity(entries: ActivityInput[]): Promise<Hex | null> {
		if (entries.length === 0) return null;

		const encoded = entries.map((e) => ({
			kind: ACTIVITY_KINDS.indexOf(e.kind),
			chain: CHAINS.indexOf(e.chain),
			symbol: symbolToBytes32(e.symbol),
			baseAmount: e.baseAmount,
			notionalAssets: e.notionalAssets,
			pnlAssets: e.pnlAssets,
			feeAssets: e.feeAssets,
			txRef: e.txRef,
			occurredAt: BigInt(e.occurredAt),
		}));

		// One transaction, so the several legs of one decision cannot land in
		// different blocks — or, worse, have the second half fail and leave a
		// bridge in the public feed with no arrival against it.
		return entries.length === 1
			? this.write("reportActivity", [encoded[0]])
			: this.write("reportActivityBatch", [encoded]);
	}

	private async write(functionName: string, args: readonly unknown[]): Promise<Hex> {
		const account = this.walletClient.account;
		if (!account) throw new Error("The wallet client has no account");

		const { request } = await this.publicClient.simulateContract({
			abi: lemonVaultAbi as Abi,
			address: this.address,
			functionName,
			args,
			account,
		});

		// Simulated before sending, always. Every write here has contract-side
		// limits that the policy layer recomputes independently, and a simulation
		// turns a disagreement between the two into a readable error instead of a
		// mined revert and a wasted MPC signature.
		return this.walletClient.writeContract(request);
	}
}

/**
 * Pack a ticker into `bytes32`, right-padded.
 *
 * Truncates at 32 bytes rather than throwing: a symbol that long is a data
 * problem, and failing the whole activity report over a label would lose the
 * trade record to protect the cosmetics.
 */
export function symbolToBytes32(symbol: string): Hex {
	const bytes = new TextEncoder().encode(symbol).slice(0, 32);
	const padded = new Uint8Array(32);
	padded.set(bytes);
	return `0x${Array.from(padded, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}
