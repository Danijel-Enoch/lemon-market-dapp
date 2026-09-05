# Lemon

Delta-neutral basis **vaults** on **Base**. A user deposits USDC and holds a
share token. An agent runs the position — long the spot token, short the
matching perp at equal size — and every move it makes is published for anyone to
check.

One vault, one market, one risk tier, one agent.

```
Admin dashboard ──creates──▶ VaultFactory ──deploys──▶ LemonVault  (Base, USDC)
                                                          │ holds funds, mints shares
       deposit USDC ─────────▶ shares minted instantly ────┤
       requestRedeem ────────▶ queued 3–7 days ────────────┤
                                                          ▼
                                          Agent (NEAR-derived wallet)
                                          ├─ pull idle USDC, buy spot (Kyber, Base)
                                          ├─ bridge margin (Relay) → short perp (Pacifica)
                                          ├─ value the position → reportNav (bounded)
                                          ├─ rebalance on unit drift
                                          └─ unwind → agentReturn → fulfillRedeem
                                                          │
                                     Ponder indexes ──────┴──▶ web + admin
```

## What a user does

Deposit USDC. That is the whole interaction.

Shares are minted immediately at the vault's current price. Withdrawals are
**requested** rather than executed: the request sits for three days minimum
while the agent unwinds your share of a real position, and the agent is held to
seven. Your shares stay outstanding for that window, so you keep earning — and
keep the risk — until the position is actually closed.

The exit price is fixed at **fulfilment**, not at request. A price fixed on the
day you asked would be a free option on everyone else's capital.

## Risk tiers

Chosen when the vault is created and immutable afterwards. They are different
products, and turning one into the other underneath existing depositors is not
something the contract allows.

| Tier | Target | Ceiling | What it means |
|---|---|---|---|
| `CONSERVATIVE` | 1x | 1x | Fully collateralised short. No liquidation price. |
| `LEVERAGED` | 2x | up to 3x | Funding yield multiplied; a liquidation price appears. |

"Conservative" is checked rather than claimed: the contract refuses to create
one at anything but exactly 1x with no headroom, and rejects a `LEVERAGED` vault
that sits at 1x. No vault of either tier may exceed 3x.

## Fees

**2% a year** on assets, streamed continuously. **20% of gains** above the
vault's previous high-water mark, so a vault that falls and recovers charges
nothing on the recovery.

Both are minted as **shares** to an insurance fund rather than transferred as
USDC — the vault is usually deployed, so there is often no USDC to pay with, and
diluting takes the fee out of the gain rather than out of working capital.
Management accrues first, which stops the operator earning a performance fee on
assets it is about to take as rent.

Fee shares are priced to be worth exactly the fee *after* the mint dilutes the
pool that pays them. The obvious implementation lands a 2% schedule at about
1.96%; the number in the docs and the number charged have to be the same number.

## The trust boundary

The position genuinely lives off-chain, so its value genuinely has to be
reported. The design does not pretend otherwise — it bounds what a compromised
agent key can do and makes the rest observable.

| Limit | What it stops |
|---|---|
| `agentWallet` is **immutable** | The agent cannot name a recipient. `agentWithdraw` takes an amount and nothing else. |
| `maxDeployedBps` + rolling window cap | Capital leaves slowly and never entirely; a buffer stays for the queue. |
| Per-report **and** per-epoch NAV bounds | One call cannot reprice the vault, and a drip of small reports cannot do slowly what one call may not do at once. |
| Leverage mandate on every report | A report above the vault's ceiling is rejected outright. |
| Guardian pause + emergency exit | A human can stop the agent. Pausing never blocks a user from queueing an exit. |

A stale NAV blocks deposits and fulfilments on-chain. That is deliberate: an
agent that has stopped reporting cannot price anything honestly, and freezing is
better than quoting.

## The public ledger

`reportActivity` records every action an agent takes — spot fills, perp opens
and closes, bridges in both directions, venue deposits, funding settlement —
tagged with the chain it happened on, with the venue's own transaction
reference. `txRef` is `bytes` rather than `bytes32` because a Solana signature is
64 bytes and a truncated one links to nothing.

These are **attestations, not proofs**. Base cannot verify a Pacifica fill. What
makes them useful is that each names a real transaction on a public chain, so
anyone can fetch it and check it — and the UI shows each row's verification state
rather than presenting them all as equally established.

The feed is at `/activity`, open with no wallet and no key.

## Architecture

Bun workspaces:

```
apps/
  web/        The depositor-facing app. React Router v7 SSR, served by Elysia
  admin/      The operator console. Its own app, its own origin, its own port
  api/        Elysia API — mounted in-process by both apps, or run standalone
  indexer/    Ponder — the read model, rebuilt from chain events
  agent/      Per-vault worker: valuation, execution, the redemption queue
packages/
  contracts/  Foundry. LemonVault (4626+7540), VaultFactory, InsuranceFund
  ui/         The Pons design system. Presentational only — no wallet, no API
  client/     The shared read layer: API calls, formatting, data hooks
  wallet/     The shared wallet layer: the chain, RainbowKit, network switching
  core/       Shared types, unit conversion, fee constants
  near-mpc/   NEAR chain-signature derivation, Ed25519 and secp256k1 signing
  pacifica/   Perp REST client, request signing, Solana deposit instruction
  kyber/      Aggregator client
  relay/      Bridge deposit addresses and status
  registry/   Spot-asset registry, pairing, basis maths
  db/         Prisma schema and client
```

**Why `client` and `wallet` are separate.** `client` is transport and
formatting with no components and no wallet, so the API and any server-side
caller can import it without dragging wagmi and a megabyte of connector UI
along. `wallet` is the half that genuinely needs a browser, and both apps take
it so their connect modal, their chain and their wrong-network handling cannot
drift apart.

**Why the admin console is its own app.** It mounts the same API plugin, so
there is one implementation of every endpoint and one place authorisation is
decided. What differs is exposure: the console is meant to sit behind whatever
an operator already uses — a VPN, an IP allowlist, an SSO proxy — while the
public app faces the internet. Sharing a process meant both had the same attack
surface and the same uptime.

**Where state lives.** Vaults, shares, balances and the withdrawal queue are on
Base, and the indexer is a disposable cache of them — drop it and a resync
rebuilds it exactly. Postgres holds only what is not derivable from events:
sessions, the admin allowlist, per-vault venue configuration, the agents'
decision log, and verification verdicts (which come from other chains and would
be discarded by a reindex).

Losing the database costs sessions and operator configuration. It cannot cost
anyone their funds.

## Agent decisions

A deterministic policy decides what is permissible and **sizes every trade**. An
OpenRouter model only picks among options the policy has already cleared. It
cannot produce an amount, an answer naming an unpermitted action is discarded,
and near a withdrawal deadline it is not consulted at all.

With no `OPENROUTER_API_KEY` the agent runs on the policy alone — less clever,
equally safe.

Every tick is recorded with its action and stated reason, so "why did the vault
sit idle through a good funding window" has an answer on the admin dashboard.

## Running it

```bash
bun install
git submodule update --init --recursive   # forge-std, for the contracts
cp .env.example .env
bun run db:generate
bun run contracts:build                   # compiles and regenerates ts/abi.ts
bun run dev                               # http://localhost:3002
```

`/` is the landing page and `/vaults` is the board. The split is deliberate:
the board assumes you already want a vault and are choosing between them, which
is the wrong first page for someone who has not decided yet. A mini-app frame
skips the landing page entirely — someone who opened this from a cast has
already decided to look at the thing.

The board and docs work with no configuration. Beyond that:

- **Vault data** needs the indexer (`bun run dev:indexer`) and a deployed
  `VAULT_FACTORY_ADDRESS`. Without it the board says the indexer is unreachable
  rather than showing an empty list.
- **Sign-in and the admin dashboard** need `DATABASE_URL` and `AUTH_SECRET`.
- **Creating vaults** additionally needs a funded NEAR account
  (`NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`) — an agent wallet is derived before
  the vault exists.
- **The agent** (`bun run dev:agent`) needs all of the above, plus `RELAY_API_KEY`
  and `SOLANA_FEE_PAYER_SECRET`. It refuses to start without either: every trade
  it places crosses a chain, and the first crossing of a deployment happens with
  a depositor's capital already drawn out of a vault.

### Deploying the contracts

```bash
cd packages/contracts
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_RPC_URL --broadcast --verify
```

Deploys the insurance fund and the factory only. Vaults are created from the
admin dashboard, because a vault needs an agent wallet derived from the NEAR MPC
network and the derivation has to happen alongside the transaction.

### Connecting a wallet

Both apps use the same RainbowKit modal, built once in `@lemon/wallet`. That
package also owns the chain the browser targets, and it is Base mainnet — pinned
in code, not read from a build variable:

```bash
VITE_CHAIN_RPC_URL=https://...            # optional: a dedicated Base endpoint
```

The chain is a fact about the deployment rather than a setting. The vault
contracts, Circle's USDC, KyberSwap's aggregator and the Relay routes the agent
bridges over all exist on Base mainnet and nowhere else, so an id read from the
environment could only ever produce a build where every write reverts while the
UI carried on looking healthy. Only the endpoint is a real choice, and the same
reasoning is applied server-side: the API, the indexer and the agent all pin the
chain and configure the RPC.

A wallet that has never been on Base is asked to add it with
`wallet_addEthereumChain`, and that call needs a full name, native currency, RPC
URL and explorer. `APP_CHAIN` keeps viem's whole Base definition rather than an
id with a transport bolted on, because a partial chain object fails that call
with an error most wallets do not explain.

### Testing

```bash
bun test                 # TypeScript tests + 128 Foundry tests
bun run contracts:test   # Foundry only
bun run test:e2e         # Playwright, against a running stack
```

The contract tests are where the write paths are covered — deposits, the
redemption queue, NAV bounds, fee accrual, and the limits that bound a
compromised agent key. They run against a fresh in-memory chain, so they are the
only place a deposit can be made without spending money.

The Playwright suite is deliberately read-only. There is no throwaway chain to
sign against any more: the app trades on Base mainnet, so a spec that deposited
would be spending real capital against real contracts. What it does cover is
everything that needs no signature — the pages render, the indexer serves them,
and what the page shows agrees with what the API returns.

```bash
bun run scripts/agent-addresses.ts    # the agent wallets, and the paths they come from
```

Without NEAR configured it falls back to two local keys. Everything still works;
the Solana column is simply blank, because there is nothing true to put in it.

### Docker

```bash
docker compose up                    # postgres + web (API embedded)
docker compose --profile split up    # + standalone API on :3003
```

## Commands

```bash
bun run dev              # the public app, with the API mounted
bun run dev:admin        # the operator console (:3004)
bun run dev:indexer      # Ponder
bun run dev:agent        # the vault agents
bun run dev:stack        # api + indexer + web together (add `admin` for the console)
bun run typecheck        # all workspaces
bun run lint             # biome
bun test                 # TypeScript tests + 128 Foundry tests
bun run contracts:test   # Foundry only
bun run test:e2e         # Playwright, against a running stack
bun run test:e2e:report  # the last run's HTML report
bun run contracts:build  # compile and regenerate ABIs
```

## End-to-end tests

Playwright, against the running stack — nothing is mocked. The data comes from
the indexer through the real API, and the assertions read what a visitor reads.
The interesting failures in this system live *between* the contract, the indexer
and the page, and a suite that stubs any of the three cannot see them.

```bash
bun run dev:stack admin      # web :3002, admin :3004, indexer :42069
bun run test:e2e
```

Read-only, and that is a real limit rather than a preference. The app trades on
Base mainnet, so there is nowhere to sign a test deposit that does not cost
money. Vault creation, deposits and the redemption queue are covered by the
Foundry suite instead.

## Agent gas

The one running cost the protocol cannot cover for itself. An agent's Base wallet
is an ordinary account and needs ETH to send a transaction; the vault holds USDC
and may only ever send USDC to one address, so it cannot be funded from protocol
capital — an operator tops it up.

The Solana side is covered differently. A derived wallet never holds SOL, so it
could not pay for its own transaction even in principle; one shared keypair
(`SOLANA_FEE_PAYER_SECRET`) pays for every agent's Pacifica deposits and bridge
legs instead. It is only ever a fee payer — never an authority over a token
account — but it has to stay funded, because an empty one stalls an unwind whose
legs have already closed.

The failure is silent, which is why the console watches it. An agent out of gas
does not crash; it fails every write, stops reporting a valuation, and its vault
goes stale — which blocks deposits and withdrawals on-chain. From the outside
that looks like a broken agent rather than an empty wallet.

The Gas tab shows both balances per vault and funds the Base side directly from
the operator's wallet. Solana is shown with its address and no button: a Base
wallet cannot send SOL, and a button that opens a wallet which then cannot sign
is worse than none.

**Bridged USDC is counted while it is in the air.** A Relay fill takes minutes,
and for those minutes the money has left one chain's balance and not arrived in
the other. Every crossing is written to `BridgeTransfer` before the origin
transaction is sent, so the valuation adds it back — and so an agent restarted
mid-bridge does not report a NAV missing the whole transfer, which would print a
dip and a recovery that never happened into every holder's share price.

## Things worth knowing

Behaviours that look like bugs and are not.

**Withdrawing restarts the clock if you top up.** Requests merge into one, so
keeping the earlier timestamp would let a one-wei request ripen for three days
and then carry an arbitrarily large addition out with it.

**A new vault shows a dash, not 0%.** The yield column is the vault's *measured*
share-price change annualised, not a projection from the current funding rate.
Too little history is reported as unknown, because rendering it as zero is a
claim about performance where none exists.

**Funding sign is inverted from most venues.** Pacifica quotes one hourly rate
where a *positive* number means longs pay shorts. A basis position holds the
short side, so it earns when longs are crowded.

**Hedge drift is measured in units, not dollars.** The two legs are priced by
different venues that disagree by a few basis points at all times, so a
dollar-denominated check would report fresh drift every tick and have the agent
rebalancing a position that never moved.

**An unroutable spot leg stales the vault rather than marking it down.** A vault
whose pool has dried up is worth an unknown amount, not its perp equity alone.
Reporting the knowable part as the whole would mark every holder down by the
entire spot leg.

**Markets are addressed by ticker, never by venue index.** Pair indexes are not
stable across protocol upgrades, and a stored one can end up naming a different
asset and trading it without complaint.

## External services

| Service | Used for | Docs |
|---|---|---|
| Pacifica | Perps, funding, OHLCV, custody | [docs.pacifica.fi](https://docs.pacifica.fi) |
| NEAR | Chain signatures for agent wallets | [docs.near.org](https://docs.near.org/chain-abstraction/chain-signatures) |
| KyberSwap | Spot routing and liquidity probes | [docs.kyberswap.com](https://docs.kyberswap.com) |
| Relay | Base ↔ Solana bridging | [docs.relay.link](https://docs.relay.link) |
| Ponder | Indexing Base into the read model | [ponder.sh](https://ponder.sh) |
| OpenRouter | The agent's advisory layer | [openrouter.ai](https://openrouter.ai) |
| Coinbase | Tokenized equities (B20) on Base | [docs.base.org](https://docs.base.org) |

## Disclaimer

Not investment advice. A basis position is delta-neutral, not risk-free: funding
can turn negative, the spot leg can become illiquid, a leveraged vault's short
can be liquidated, and the vault is custodial — your USDC is held by a contract
and traded by an agent. The contracts have not been independently audited.
