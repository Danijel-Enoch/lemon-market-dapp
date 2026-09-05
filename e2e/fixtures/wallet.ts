import type { Page } from "@playwright/test";
import {
	type Address,
	type Chain,
	createPublicClient,
	createWalletClient,
	custom,
	type Hex,
	http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * A wallet the browser believes, driven from Node.
 *
 * There is no way to test this app end to end without one. Creating a vault,
 * depositing and queueing a redemption are all signed transactions, and the
 * signing normally happens inside a browser extension Playwright cannot reach.
 *
 * So the extension is replaced rather than driven: an EIP-1193 provider is
 * installed on `window`, announced over EIP-6963 as MetaMask so RainbowKit
 * offers it, and every call it receives is forwarded to a `viem` wallet client
 * here in Node holding one of anvil's keys. The page's wagmi, its SIWE sign-in
 * and its `writeContract` calls all take the ordinary path — the only thing
 * that changed is who holds the key.
 *
 * The transactions are real. They land on the fork, the indexer picks them up,
 * and the assertions afterwards read the same API the app reads.
 */

/** Anvil's first account — the deployer, and the admin on a `fork:up` chain. */
export const DEPLOYER_PK =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

/** Anvil's second account — "Alice", funded with USDC by `fork-up.sh`. */
export const ALICE_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

/**
 * The addresses those keys produce.
 *
 * Derived once here so a test can name the wallet it is acting as without
 * asking the page. Reading it back through `eth_accounts` looks tidier but is
 * wrong: that call answers "which accounts has this site been granted", which
 * is empty until a connector has asked — so a helper built on it returns
 * nothing whenever the app connected by some path that did not go through
 * `eth_requestAccounts`, and the test then queries the API for `undefined`.
 */
export const DEPLOYER_ADDRESS = privateKeyToAccount(DEPLOYER_PK).address;
export const ALICE_ADDRESS = privateKeyToAccount(ALICE_PK).address;

export interface WalletOptions {
	privateKey: Hex;
	rpcUrl: string;
	chainId: number;
	chainName: string;
}

/**
 * Install the provider before the app's own scripts run.
 *
 * Order matters twice over. `exposeBinding` has to be in place before the init
 * script executes, or the shim calls a function that does not exist yet; and
 * the init script has to run before the page's JavaScript, or wagmi has already
 * finished looking for wallets by the time the provider announces itself.
 */
export async function installWallet(page: Page, opts: WalletOptions): Promise<Address> {
	const account = privateKeyToAccount(opts.privateKey);

	/**
	 * A real wallet has not authorised a site it has never seen, and reports no
	 * accounts until the user approves a connection. Modelling that matters:
	 * a shim that answers `eth_accounts` unconditionally makes wagmi reconnect
	 * on load, so the app is already connected before any test has clicked
	 * anything — and the connect flow, which is the part most likely to be
	 * broken, is never exercised at all.
	 */
	let authorized = false;

	const chain: Chain = {
		id: opts.chainId,
		name: opts.chainName,
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
		rpcUrls: { default: { http: [opts.rpcUrl] } },
	};

	const transport = http(opts.rpcUrl);
	const publicClient = createPublicClient({ chain, transport });
	const walletClient = createWalletClient({ account, chain, transport });

	await page.exposeBinding(
		"__lemonWalletRequest",
		async (_source, raw: { method: string; params?: unknown[] }) => {
			const { method, params = [] } = raw;
			// Set E2E_WALLET_DEBUG=1 to see exactly what the page asks the wallet
			// for. A write that never reaches here is a UI problem, not a chain one.
			if (process.env.E2E_WALLET_DEBUG) console.log(`  [wallet] ${method}`);

			switch (method) {
				// The prompt. Approving is what authorises the site.
				case "eth_requestAccounts":
					authorized = true;
					return [account.address];

				// The silent read. Empty until the site has been approved.
				case "eth_accounts":
					return authorized ? [account.address] : [];

				case "eth_chainId":
					return `0x${opts.chainId.toString(16)}`;

				case "net_version":
					return String(opts.chainId);

				/**
				 * SIWE. The app signs a plain string; wagmi hands it over as hex,
				 * which is what `personal_sign` is specified to carry.
				 */
				case "personal_sign": {
					const [message] = params as [Hex, Address];
					return walletClient.signMessage({ account, message: { raw: message } });
				}

				case "eth_signTypedData_v4": {
					const [, typedData] = params as [Address, string];
					return walletClient.signTypedData({
						account,
						...(JSON.parse(typedData) as Parameters<typeof walletClient.signTypedData>[0]),
					});
				}

				/**
				 * The real thing. `gas` and the fee fields are dropped and left to
				 * viem to estimate: wagmi's estimate is made against the page's own
				 * transport, and a stale one here fails the transaction for reasons
				 * that have nothing to do with what is under test.
				 */
				case "eth_sendTransaction": {
					const [tx] = params as [
						{ from: Address; to?: Address; data?: Hex; value?: Hex; gas?: Hex },
					];
					if (process.env.E2E_WALLET_DEBUG) {
						console.log(`  [wallet] -> to=${tx.to} data=${(tx.data ?? "").slice(0, 10)}`);
					}
					return walletClient
						.sendTransaction({
							account,
							chain,
							to: tx.to ?? null,
							data: tx.data,
							value: tx.value ? BigInt(tx.value) : undefined,
							// viem's overloads require `kzg` unless the request type is
							// narrowed to a non-blob transaction, which cannot be expressed
							// for a value arriving as untyped JSON-RPC params.
							kzg: undefined,
						})
						.catch((e) => {
							if (process.env.E2E_WALLET_DEBUG) {
								console.log(`  [wallet] !! send failed: ${String(e).slice(0, 500)}`);
							}
							throw e;
						});
				}

				/**
				 * The chain is already the one the app wants, so both of these are
				 * accepted no-ops. Answering with an error would put the app into
				 * its wrong-network state on a chain that is in fact correct.
				 */
				case "wallet_switchEthereumChain":
				case "wallet_addEthereumChain":
					return null;

				// Some connectors ask for permissions rather than accounts. Granting
				// one is granting the other, so this authorises as well.
				case "wallet_requestPermissions":
					authorized = true;
					return [{ parentCapability: "eth_accounts" }];

				case "wallet_getPermissions":
					return authorized ? [{ parentCapability: "eth_accounts" }] : [];

				// Everything else is an ordinary read. Forward it untouched.
				default:
					return publicClient.request({ method, params } as never);
			}
		},
	);

	await page.addInitScript(
		({ address, chainIdHex }) => {
			const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

			const provider = {
				isMetaMask: true,
				isConnected: () => true,
				chainId: chainIdHex,
				selectedAddress: address,

				request: (args: { method: string; params?: unknown[] }) =>
					(
						window as unknown as {
							__lemonWalletRequest: (a: unknown) => Promise<unknown>;
						}
					).__lemonWalletRequest({ method: args.method, params: args.params ?? [] }),

				on(event: string, handler: (...args: unknown[]) => void) {
					if (!listeners.has(event)) listeners.set(event, new Set());
					listeners.get(event)?.add(handler);
					return provider;
				},
				removeListener(event: string, handler: (...args: unknown[]) => void) {
					listeners.get(event)?.delete(handler);
					return provider;
				},
				// Some connectors call these instead; aliasing keeps them working.
				addListener: (e: string, h: (...args: unknown[]) => void) => provider.on(e, h),
				off: (e: string, h: (...args: unknown[]) => void) => provider.removeListener(e, h),
			};

			Object.defineProperty(window, "ethereum", {
				value: provider,
				writable: true,
				configurable: true,
			});

			/**
			 * EIP-6963. RainbowKit prefers announced providers over `window.ethereum`,
			 * and a wallet that only sets the legacy global shows up as "not
			 * installed" in the modal — which is a dead end for a click-through test.
			 *
			 * The announcement is re-emitted on request because wagmi asks for it on
			 * mount, which happens after this script has already run once.
			 */
			const detail = Object.freeze({
				info: {
					uuid: "00000000-0000-4000-8000-000000000001",
					name: "MetaMask",
					icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
					rdns: "io.metamask",
				},
				provider,
			});

			const announce = () =>
				window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));

			window.addEventListener("eip6963:requestProvider", announce);
			announce();
		},
		{ address: account.address, chainIdHex: `0x${opts.chainId.toString(16)}` },
	);

	return account.address;
}
