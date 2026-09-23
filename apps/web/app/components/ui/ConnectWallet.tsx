import { AccountModal } from "@app/components/ui/AccountModal";
import { cn } from "@lemon/ui";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { UserCircle2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { useNavigate } from "react-router";

/**
 * Wallet control.
 *
 * The wallet gets the only inverted control in the bar — ink fill, lime type
 * — because it is the one action the bar exists to offer. Once connected the
 * inversion is spent, so the chain and the address drop back to hairline boxes
 * and the emphasis is free to mark something else on the page.
 */

const SOLID =
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--pon-r-lg)] border border-[var(--pon-ink)] bg-[var(--pon-ink)] px-4 py-[7px] font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]";

const HAIRLINE =
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)] px-3 py-[7px] font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-fg)] transition-colors hover:bg-[var(--pon-ink)] hover:text-[var(--pon-on-lime)]";

export function ConnectWallet({
	text = "Connect",
	connectedNode,
	href,
	onClick,
	className,
	...props
}: {
	text?: React.ReactNode;
	connectedNode?: React.ReactNode;
	href?: string;
} & ComponentProps<"button">) {
	const navigate = useNavigate();
	const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

	return (
		<ConnectButton.Custom>
			{({ account, chain, openChainModal, openConnectModal, mounted }) => {
				const ready = mounted;
				const connected = ready && account && chain;

				return (
					<div
						{...(!ready && {
							"aria-hidden": true,
							style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
						})}
					>
						{(() => {
							if (!connected) {
								return (
									<button type="button" onClick={openConnectModal} className={cn(SOLID, className)}>
										{text}
									</button>
								);
							}

							if (connectedNode) {
								return (
									<button
										type="button"
										className={cn(SOLID, className)}
										onClick={(event) => {
											if (href) {
												event.preventDefault();
												navigate(href);
											}
											onClick?.(event);
										}}
										{...props}
									>
										{connectedNode}
									</button>
								);
							}

							if (chain.unsupported) {
								return (
									<button
										type="button"
										onClick={openChainModal}
										className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--pon-r-lg)] border border-[var(--pon-down)] px-4 py-[7px] font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-down)] transition-colors hover:bg-[var(--pon-down)] hover:text-[var(--pon-paper)]"
									>
										Wrong network
									</button>
								);
							}

							return (
								<div className="flex items-center gap-2">
									{/* Chain — a hairline chip carrying the network mark. */}
									<button
										type="button"
										onClick={openChainModal}
										className={cn(HAIRLINE, "hidden sm:inline-flex")}
									>
										{chain.hasIcon && (
											<span
												aria-hidden
												className="size-4 shrink-0 overflow-hidden rounded-full"
												style={{ background: chain.iconBackground }}
											>
												{chain.iconUrl && (
													<img
														alt=""
														src={chain.iconUrl}
														width={16}
														height={16}
														className="block size-4"
													/>
												)}
											</span>
										)}
										<span className="hidden md:inline">{chain.name}</span>
									</button>

									{/* Address — tabular, so a truncated hash keeps its width. */}
									<button
										type="button"
										onClick={() => setIsAccountModalOpen(true)}
										className={cn(HAIRLINE, "font-fono")}
										{...props}
									>
										<span className="hidden md:inline">{account.displayName}</span>
										<UserCircle2 size={16} aria-hidden className="md:hidden" />
									</button>
								</div>
							);
						})()}

						<AccountModal
							open={isAccountModalOpen}
							onOpenChange={setIsAccountModalOpen}
							account={account}
							chain={chain}
						/>
					</div>
				);
			}}
		</ConnectButton.Custom>
	);
}
