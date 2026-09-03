import { signTypedData } from "@wagmi/core";
import type { Config } from "wagmi";

export interface TypedDataPayload {
	domain: Record<string, unknown>;
	types: Record<string, { name: string; type: string }[]>;
	primaryType: string;
	message: Record<string, unknown>;
}

/**
 * Sign an EIP-712 payload whose shape is only known at runtime.
 *
 * Both the reference design and KyberSwap return the domain, types and message from their
 * APIs, so the structure cannot be described to wagmi's generics ahead of time.
 * The cast is confined here rather than repeated at each call site, and the
 * payload is passed through untouched — re-deriving or reordering any field
 * would change the digest and produce a signature the verifier rejects.
 */
export function signServerTypedData(config: Config, payload: TypedDataPayload) {
	return signTypedData(config, {
		domain: payload.domain,
		types: payload.types,
		primaryType: payload.primaryType,
		message: payload.message,
	} as never);
}
