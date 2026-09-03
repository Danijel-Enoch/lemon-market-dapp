import { prisma, type User } from "@lemon/db";
import { generateKeypair, keypairFromSecret, localSigner, type Signer } from "@lemon/pacifica";
import { clients, config } from "../config";
import { AuthError } from "./auth";
import { seal, unseal } from "./secrets";

/**
 * The Pacifica side of an account.
 *
 * Pacifica identifies an account by the Solana address that owns it, which here
 * is the user's derived wallet. That wallet's key lives in the MPC network, and
 * reaching it costs a NEAR transaction — far too slow to sit in the path of
 * every order.
 *
 * So the MPC key is used exactly once, to authorise an agent key that this
 * server holds. After that, orders are signed locally in microseconds. The
 * trade-off is explicit: the agent key can trade, and it cannot withdraw —
 * withdrawals are one of the operations Pacifica insists the account key signs,
 * which is what stops a compromised server from emptying anyone's account.
 */

/** The pending agent key a Pacifica challenge carries between requests. */
interface PendingAgent {
	publicKey: string;
	/** base64 of the 32-byte Ed25519 seed. */
	secret: string;
}

/**
 * Mint an agent key for the user to authorise.
 *
 * Generated when the challenge is issued rather than after it is answered,
 * because the key has to appear in the text the user signs — otherwise they
 * would be approving "some agent key", which authorises nothing in particular.
 * The secret is sealed immediately and parked on the challenge; an abandoned
 * activation therefore leaves a useless expiring row and no trace on the user.
 */
export function mintPendingAgent(): { publicKey: string; sealed: string } {
	const keypair = generateKeypair();
	const pending: PendingAgent = {
		publicKey: keypair.publicKey,
		secret: Buffer.from(keypair.secretKey).toString("base64"),
	};
	return { publicKey: keypair.publicKey, sealed: seal(JSON.stringify(pending)) };
}

function openPendingAgent(sealed: string): PendingAgent {
	const pending = JSON.parse(unseal(sealed)) as PendingAgent;
	if (!pending?.publicKey || !pending?.secret) {
		throw new AuthError("Activation state is unreadable. Start again.", 400);
	}
	return pending;
}

/**
 * Bind the agent key to the user's Pacifica account and record it.
 *
 * The binding call itself is signed by the account key through MPC — the one
 * moment in the app's life where the NEAR network signs for a user. Persisting
 * happens only after Pacifica accepts, so a failed bind leaves no key that the
 * app believes is live but Pacifica has never heard of.
 */
export async function activatePacifica(params: {
	user: User;
	sealedAgent: string;
	/** The key the user actually signed for, re-checked against the sealed one. */
	agentPublicKey: string;
}): Promise<User> {
	const pending = openPendingAgent(params.sealedAgent);

	// The signature covered this exact key. If the two ever disagree, something
	// swapped the key between issuing and answering the challenge, and the
	// user's authorisation does not cover what is about to be bound.
	if (pending.publicKey !== params.agentPublicKey) {
		throw new AuthError("Activation key does not match the one that was signed for.", 400);
	}

	const mpc = clients.nearMpc;
	if (!mpc) {
		throw new AuthError("NEAR signing is not configured on this deployment.", 503);
	}

	const sign = mpc.solanaMessageSigner(params.user.derivationPath);
	const builder = config.fees.pacificaBuilder;

	try {
		// Approve the builder code first, and bind the agent second.
		//
		// The order matters on failure, not on success. Approving and then
		// failing to bind leaves a permission the user granted and nothing that
		// uses it — harmless. Binding and then failing to approve would leave an
		// account the app believes can trade, whose every attributed order
		// Pacifica rejects. Only one of those two is recoverable by retrying.
		if (builder) {
			await clients.pacifica.approveBuilderCode(sign, {
				account: params.user.solanaAddress,
				builderCode: builder.code,
				maxFeeRate: builder.maxFeeRate,
			});
		}

		await clients.pacifica.bindAgentWallet(sign, params.user.solanaAddress, pending.publicKey);
	} catch (error) {
		// Two very different failures arrive here — the NEAR network refusing to
		// sign, and Pacifica refusing the binding — and they have different
		// owners. Saying which happened is the difference between an operator
		// checking their relayer account and a user retrying pointlessly.
		const detail = error instanceof Error ? error.message : String(error);
		throw new AuthError(
			`Could not authorise the agent key: ${detail}. Nothing was changed; try activating again.`,
			502,
		);
	}

	return prisma.user.update({
		where: { id: params.user.id },
		data: {
			pacificaAgentPublicKey: pending.publicKey,
			pacificaAgentSecret: seal(pending.secret),
			pacificaBoundAt: new Date(),
			// Recorded as the pair the user actually agreed to, so a later change
			// to either is visible as a mismatch rather than assumed to be fine.
			pacificaBuilderCode: builder?.code ?? null,
			pacificaBuilderMaxFeeRate: builder?.maxFeeRate ?? null,
			pacificaBuilderApprovedAt: builder ? new Date() : null,
		},
	});
}

export interface TradingIdentity {
	/** Signs canonical Pacifica messages with the agent key. */
	sign: Signer;
	/** The account orders are placed for — the user's derived Solana address. */
	account: string;
	/** Named on the wire so Pacifica knows which key to verify against. */
	agentWallet: string;
}

/**
 * The signer used for ordinary trading.
 *
 * Throws rather than falling back to the MPC path when a user has not
 * activated: silently signing an order with the account key would work, but it
 * would take seconds and bypass the authorisation the user was asked for.
 */
export function tradingIdentity(user: User): TradingIdentity {
	if (!user.pacificaAgentPublicKey || !user.pacificaAgentSecret || !user.pacificaBoundAt) {
		throw new AuthError("Activate your Pacifica account before trading.", 403);
	}

	const secret = Buffer.from(unseal(user.pacificaAgentSecret), "base64");
	const keypair = keypairFromSecret(new Uint8Array(secret));

	// A mismatch means the stored key is not the one Pacifica authorised, so
	// every order would be rejected. Better to say so than to send them.
	if (keypair.publicKey !== user.pacificaAgentPublicKey) {
		throw new AuthError(
			"Stored agent key does not match the one Pacifica has. Re-activate your account.",
			409,
		);
	}

	return {
		sign: localSigner(keypair.secretKey),
		account: user.solanaAddress,
		agentWallet: user.pacificaAgentPublicKey,
	};
}
