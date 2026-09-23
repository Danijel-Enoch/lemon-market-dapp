# Lemon

Delta-neutral basis **vaults** on **Base**. A user deposits USDC and holds a
share token. An agent runs the position — long the spot token, short the
matching perp at equal size — and every move it makes is published for anyone to
check.

One vault, one risk tier, one agent — and one or several markets.

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
                                          ├─ rebalance on unit drift, per market
                                          └─ unwind → agentReturn → fulfillRedeem
                                                          │
                                     Ponder indexes ──────┴──▶ web + admin
```

## Markets

A vault can run a basis position in more than one market at once — BTC, ETH and
NVDA against a single pool of depositor capital — and that is decided entirely
off-chain. No contract knows about it.

On-chain a vault still looks like one market: `marketId` is set in the
constructor and never changes. That was always a *label* rather than a
constraint. The contract holds USDC, bounds what the agent may withdraw, caps
how much may be deployed, and checks the leverage reported back — and none of
those are per-market. The one place the chain does carry a market is
`reportActivity`, which already tags every row with its own symbol, so a
three-market vault publishes a legible feed without a single contract change.

Each market is a row in `VaultMarket` with a **target weight**, and the enabled
weights add up to 100%. The agent deploys into whichever market is furthest
below its share, **one market per tick**. That is not a simplification: a
deployment is a bridge, a leverage change, a perp order and a swap, spread
across two chains and a third venue's matching engine, and there is no atomic
form of it. Doing four at once means four independent ways to end up half-open.
Ticks are a minute apart, so the weights converge on their own.

Retiring a market **disables its row rather than deleting it**. A vault can hold
a position in a market an operator has changed their mind about, and a deleted
row is a position the agent can no longer see, value, or sell — it would vanish
from the NAV while the tokens sat in a wallet. A disabled market's target reads
as zero, which makes it the most overweight market the vault has: the next
unwind drains it first, and no new capital goes near it.

What is emphatically *not* per-market is the money. One Pacifica account, one
Base wallet, one Solana wallet, one bridge. So margin, idle USDC and in-flight
capital are counted **once for the vault**, and leverage is the sum of every
short's notional against the one equity — which is also what the venue
liquidates against. Summing per-market valuations instead would report a
three-market vault as worth roughly three times its margin, and write that into
every holder's share price.

## Standing a vault down

An operator can tell an agent to close every position and send all of it back to
the vault. It is its own lever, not a use of one of the existing two, because
neither of those does this:

| | Deposits | Withdrawal queue | The position |
|---|---|---|---|
| **Pause** (on-chain) | stopped | still served | stays open, still managed |
| **Stop agent** | blocked by a stale NAV | **blocked** | stays open, unmanaged |
| **Close order** | still open | still served | sold, capital returned |

Stopping the agent is the tempting one and the wrong one: it stops the agent
*reporting*, the NAV goes stale, and that blocks the very withdrawals an
operator winding a vault down is usually trying to serve. Under a close order
the agent keeps ticking — it reports NAV, it fulfils redemptions — it simply
holds no position and opens no new one.

The order is **standing**, not one-shot. A flag that cleared itself the moment
the position went flat would have the very next tick see idle USDC, decide it
should be earning, and undo the whole thing. So it stays until an operator lifts
it, and `closeCompletedAt` records when the agent first reported the vault
actually flat — which is the tick *after* the closing one, because the legs have
to be observed empty and the NAV reported at zero before the position is flat by
any measure a depositor could check.

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
  kyber/      KyberSwap aggregator — routes Base and Arbitrum
  lifi/       LI.FI aggregator — general router, unused by the three chains here
  univ3/      Uniswap V3 read directly — routes X Layer, which no service indexes
  relay/      Bridge deposit addresses and status
  registry/   Spot-asset registry, pairing, basis maths
  db/         Prisma schema and client
scripts/
  dev.sh                Run the stack against one environment, with an optional overlay
  deploy-contracts.sh   Deploy to one chain, verify, write the addresses back to an env file
  deploy-xlayer.sh      That, then the rest of X Layer's wiring: browser, indexer, agent
  apply-multichain.sh   One-off: the schema change a deploy will not make unattended
  verify-chain-assets.ts  Read symbol()/decimals() for every chain's USDC
  indexer-reset.sh      Drop the read model so the next start reindexes
  seed-venue-config.ts  Backfill venue config for vaults made outside the admin flow
  agent-addresses.ts    The agent wallets, and the derivation paths they come from
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
the chain the vault custodies on, and the indexer is a disposable cache of them
— drop it and a resync rebuilds it exactly. Postgres holds only what is not
derivable from events:
sessions, the admin allowlist, the markets each vault trades and in what
proportion, any standing order to close a vault's positions, the agents'
decision log, and verification verdicts (which come from other chains and would
be discarded by a reindex).

Losing the database costs sessions and operator configuration. It cannot cost
anyone their funds.

**Which chain.** A vault is identified by `(chainId, address)` everywhere — the
indexer's tables, the Prisma schema and every map that joins them. Not caution:
a vault address is `CREATE`-derived from the factory's address and nonce, and
the factories are deployed from one deployer at matching nonces, so the *same*
address on two chains is the likely case rather than a coincidence to guard
against. Keyed by address alone, the second chain's first vault would overwrite
the first chain's row, and every number on the page would be a correct number
about the wrong vault.

The same reasoning runs through the agent wallets. `agentDerivationPath` takes
the chain and has no default, because market-plus-tier was unique only while
there was one chain: an NVDA conservative vault on Arbitrum derived byte-for-byte
the same path as the one on Base, and therefore the same signing key for two
separate books. Base keeps its original two-segment path — those wallets already
hold positions, and versioning them would be a migration moving real money for
no benefit — and the namespaces provably cannot collide, because a legacy path's
second segment is always a tier and no chain key is a tier name.

The indexer uses Ponder's `multichain` ordering rather than `omnichain`. Nothing
here reads state another chain's handler wrote, so a global timestamp order buys
nothing and costs a real thing: one lagging endpoint would hold up indexing for
every chain. Independently ordered, a slow X Layer makes X Layer vaults stale
and leaves Base alone.

**What each chain trades.** The perp leg is the same everywhere — one Pacifica
account on Solana, reached by bridging USDC out and back — and the spot leg is
entirely chain-specific:

| | spot venue | markets |
|---|---|---|
| Base | KyberSwap | Coinbase B20 equities + curated crypto |
| Arbitrum | KyberSwap | WETH, WBTC, ARB, LINK, AAVE, UNI, CRV — **no tokenized equities exist on Arbitrum** |
| X Layer | Uniswap V3, read directly | xBTC, xETH, xSOL + eleven `w…x` equities — the widest equity set of the three |

**X Layer has no routing service, so it reads the pools itself.** That chain
went to LI.FI originally, on the understanding that LI.FI reached its Uniswap
v3 pools through SushiSwap's aggregator. It does not: LI.FI answers "Could not
find token on chain 196" for all fourteen tokens traded there — individual
token lookups included, so it is not a curation artifact — and returns "No
available quotes" even between two tokens it does list on the chain. The board
showed fourteen unvaultable markets and no X Layer vault could be created at
all.

The pools were never missing. There are fifty-one of them across the fourteen
tokens, on the Uniswap V3 deployment at `0x4B2ab38D…`, with liquidity split
between USDC and USDG pairs. `@lemon/univ3` quotes them through `QuoterV2` and
executes through `SwapRouter02`, trying the direct pair and the USDG hop on
every quote and taking whichever delivers more. Thirteen of the fourteen
markets are vaultable on that route; the fourteenth is blocked by the
price-divergence guard, which is a fact about that pool rather than about
routing.

The aggregator is a property of the chain, not a setting: KyberSwap has no
X Layer deployment, and `KyberAggregatorClient` throws on a chain it cannot
route rather than building a URL from a slug that does not exist. Both
implement `SpotAggregator` in `@lemon/core`, so the agent asks its vault's
chain for one and trades through whatever comes back.

**X Layer's quote asset is split**, which is the one thing that makes it unlike
the others. Its deep pools quote against USDG rather than USDC, and nine of its
fourteen markets have no direct USDC pair at all — LI.FI returns no route for
USDC to xETH while quoting both USDC to USDG and USDG to xETH happily. The
adapter closes that gap itself: it quotes the direct pair, quotes the hop when
the direct fill is poor enough that a hop could beat it, and takes whichever
actually delivers more. Nothing records which quote asset a token uses, because
that moves with liquidity and a stale table would report a live market as
unroutable — the one failure indistinguishable from the market being empty.

**One agent process per chain.** Everything an agent does is bound to a single
chain at once — the wallet client signs with its id, the USDC it moves is that
chain's, the bridge quotes it as the origin — so `AGENT_CHAIN_ID` selects the
chain and the worker skips every vault that is not on it. The failure this
prevents is not a reverted transaction: reads against an address that holds
nothing on this chain return zero, and a NAV of zero reported to a funded vault
wipes out every holder's share price.

## Agent decisions

A deterministic policy decides what is permissible and **sizes every trade**. An
OpenRouter model only picks among options the policy has already cleared. It
cannot produce an amount, it cannot choose which market an action applies to
beyond the ones offered, an answer naming an unpermitted action is discarded,
and near a withdrawal deadline it is not consulted at all.

It is also not consulted under an operator's close order, which is returned as
the only permitted action. A model that could talk the agent out of an order
would make it something other than an order.

With no `OPENROUTER_API_KEY` the agent runs on the policy alone — less clever,
equally safe.

Every tick is recorded with its action, the market it was aimed at, and its
stated reason, so "why did the vault sit idle through a good funding window" has
an answer on the admin dashboard.

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

### Running against a second deployment

`bun run dev:stack` takes an optional env file as its first argument and sources
it on top of `.env`, so its values win:

```bash
bun run dev:stack                      # .env alone
bun run dev:stack .env.local           # .env with .env.local over it
bun run dev:stack .env.local web api   # only these services, not these as well
```

Shell variables beat `--env-file` in Bun, which is what makes the overlay work
without touching anything. It exists because `.env` holds the mainnet addresses
this app deploys against, and a half-reverted edit to that file is how a run
ends up pointed somewhere nobody intended. The banner it prints on start — the
chain, the RPC and the factory address — is there so a run against the wrong
deployment is visible in the first line rather than in the data twenty minutes
later.

### Deploying the contracts

```bash
scripts/deploy-contracts.sh                 # Base, the default
CHAIN=arbitrum scripts/deploy-contracts.sh  # Arbitrum One
CHAIN=xlayer scripts/deploy-contracts.sh    # X Layer
```

One run per chain. The contracts are identical on each — the Solidity contains
no chain-specific address and no `block.chainid` — but the deployed addresses,
the start block, the asset and the explorer are not, so each chain gets its own
deploy and its own `_<CHAIN>`-suffixed variables.

It asks for a deployer key and an explorer API key, checks the key and the chain
before spending anything, simulates against real chain state, prints what it is
about to do and what it will cost, and only then asks for confirmation. Neither
key is written to disk or to your shell history. Afterwards it verifies both
contracts — on Etherscan for Base and Arbitrum, on OKLink for X Layer, which
Etherscan v2 does not index.

Before it broadcasts it reads `symbol()` and `decimals()` off the asset and
refuses anything that is not a six-decimal token, because every amount in this
system is stored and formatted as 6dp USDC. On a chain whose USDC address has
not been verified against the chain it names, it also makes you type the symbol
back — the asset is immutable on the factory, and a wrong one means every vault
it ever creates is dead on arrival.

```bash
bun run chains:verify   # read symbol() and decimals() for every chain's asset
```

The last step is the point of the script. Five variables per chain —
`VAULT_FACTORY_ADDRESS_<CHAIN>`, `VITE_VAULT_FACTORY_ADDRESS_<CHAIN>`,
`INSURANCE_FUND_ADDRESS_<CHAIN>`, `VAULT_FACTORY_START_BLOCK_<CHAIN>` and
`USDC_ADDRESS_<CHAIN>` — have to name the same deployment before the app, the
admin console and the indexer agree about which protocol they are looking at.
The script writes all of them itself, keeping a timestamped backup of the file
it edited. For Base it also writes the unsuffixed names, which every older
`.env` still reads.

**A factory address is what enables a chain.** There is no separate list of
enabled chains, on the server or in the browser: a chain with no
`VAULT_FACTORY_ADDRESS_<CHAIN>` is not indexed, not offered in the app's network
switcher, and not something a vault can be created on. Two lists that have to
agree eventually disagree, and the way that one fails is a chain offered to a
user with nothing deployed on it.

```bash
scripts/deploy-contracts.sh .env.local                  # write the results there instead
VERIFY_ONLY=1 CHAIN=arbitrum scripts/deploy-contracts.sh  # re-verify, no key needed
```

`--verify` on the broadcast fails often enough for reasons that have nothing to
do with the contracts — a cold index, a rate limit — that `VERIFY_ONLY=1` is
worth knowing about. It is idempotent; an already-verified contract just says
so.

The command underneath, if you would rather drive it by hand:

```bash
cd packages/contracts
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL_ARBITRUM --broadcast --verify
```

`Deploy.s.sol` picks the asset from `block.chainid` and reverts on a chain it
has no default for, so a run pointed at the wrong `--rpc-url` fails rather than
deploying a factory against an address that holds no contract there.

Either way this deploys the insurance fund and the factory only. Vaults are
created from the admin dashboard, because a vault needs an agent wallet derived
from the NEAR MPC network and the derivation has to happen alongside the
transaction. Then:

```bash
bun run contracts:build   # regenerate ts/abi.ts from the new artifacts
bun run indexer:reset     # vault addresses repeat across deployments
```

#### X Layer, in one command

```bash
scripts/deploy-xlayer.sh            # deploy + wire, writing to .env
WIRE_ONLY=1 scripts/deploy-xlayer.sh   # already deployed; just wire it
```

Deploying is the short half. The long half is that the web app, the admin
console, the API, the indexer and the agent each have to be told separately that
the chain exists — and each of them fails *quietly* when they have not been. A
missing `VITE_VAULT_FACTORY_ADDRESS_XLAYER` is a chain that never appears in the
network switcher. A missing start block is an indexer reading X Layer from
genesis, which presents as a hang. An agent still on `AGENT_CHAIN_ID=8453` skips
every X Layer vault it sees and logs nothing but a tick with no work in it.

So this runs `CHAIN=xlayer scripts/deploy-contracts.sh` — the same shared script,
not a second deploy path — and then reads the factory back off the chain to
check it answers `asset()` with the token the env file claims, seeds the four
variables the deploy does not write, rebuilds the ABIs, and prints what each
service now reads and what has to restart. It is re-runnable and will not
redeploy.

Four things are true of X Layer and of no other chain here: gas is **OKB**, so a
deployer funded with ETH cannot send a transaction at all; verification is
**OKLink**, because Etherscan v2 does not index the chain and a Basescan key is
rejected; spot routes through **LI.FI**, so `LIFI_API_KEY` matters more than it
looks — its free tier 429s for two hours, and reached mid-trade that is a
position with one leg on; and the USDC is **bridged**, with a second contract on
the same chain answering `symbol()` "USDC" with six decimals that is not it.

The agent is the piece that is a container rather than a variable. One process
serves one chain — a process reading an X Layer vault's balances against Base
reads zero, and a NAV of zero reported to a funded vault wipes out every
holder's share price — so `docker-compose.dokploy.yml` carries one agent service
per chain, `agent` and `agent-xlayer`, both deployed by default:

```bash
docker compose -f docker-compose.dokploy.yml up -d --build
AGENT_CHAIN_ID=196 bun run dev:agent   # one chain's agent, locally
```

Each service **pins** its own `AGENT_CHAIN_ID` rather than reading the shared
variable. A value in `.env` would otherwise point both containers at the same
chain, and two agents ticking one vault is duplicate deployments and two NAV
reports racing each other.

Running both at once needs **one NEAR access key per agent**, on the same NEAR
account — `NEAR_PRIVATE_KEY_BASE` and `NEAR_PRIVATE_KEY_XLAYER`, each falling
back to `NEAR_PRIVATE_KEY`. Signatures are NEAR transactions from one access
key and the client serialises them with an in-process queue, which two
containers cannot share; on one key they race on the nonce and one of each pair
is rejected. A second key changes no addresses — a vault's agent wallet derives
from the account id and the path, not from the key that authorises the call.

Adding a chain to a database that predates multi-chain also needs the column
that carries it. `packages/db/prisma/multichain.sql` holds the statements, with
what they do and why none of them is destructive — every new column arrives
defaulted to Base, which is what every existing row was.

**A deployment onto a pre-multichain database fails until this is applied**, and
fails in a way worth recognising. The `migrate` service runs `prisma db push`,
which refuses a primary-key swap unattended:

```
⚠️  There might be data loss when applying the changes:
  • The primary key for the `VaultConfig` table will be changed.
Error: Use the --accept-data-loss flag ...
```

That is the correct outcome — it blocks the release rather than letting a
half-migrated schema serve traffic — and the fix is to apply the change once, by
hand, not to add `--accept-data-loss` to the pipeline:

```bash
scripts/apply-multichain.sh                      # via $DATABASE_URL
CONTAINER=…-postgres-1 scripts/apply-multichain.sh   # or through docker
```

It refuses to run twice, takes a backup first, applies the file in one
transaction, and verifies the result before reporting success. Stop the agents
before running it: vault rows are repointed at a new primary key, and a tick
landing halfway through would write against the old one.

### Connecting a wallet

Both apps use the same RainbowKit modal, built once in `@lemon/wallet`. That
package also owns which chains the browser can target:

```bash
VITE_RPC_URL_BASE=https://...             # optional: a dedicated endpoint per chain
VITE_RPC_URL_ARBITRUM=https://...
VITE_RPC_URL_XLAYER=https://...
```

**The set of chains is not configurable; which of them are live is.** The three
this build knows about — Base (8453), Arbitrum One (42161) and X Layer (196) —
are a closed list in `packages/core/src/chain.ts`, and nothing anywhere accepts
a chain id from the environment. An id that could be anything could only ever
name a chain with no factory on it, and the failure mode is a process that runs
cleanly and serves an empty app.

What the environment chooses is which of the three have a factory, and that is
also what the app offers. A chain with no `VITE_VAULT_FACTORY_ADDRESS_<CHAIN>`
is absent from the network switcher entirely, so switching to it is not
something the UI can do — the same protection the old single-chain pin gave,
expressed as a filter rather than as a constant.

A vault lives on exactly one chain, that chain is baked into its row at
creation, and nothing derives it from the connected wallet. The deposit panel
pins its reads and writes to the vault's chain and offers to switch if the
wallet is elsewhere; a read aimed at the wrong chain would return a balance of
zero from an address where the user genuinely holds USDC.

A wallet that has never seen a chain is asked to add it with
`wallet_addEthereumChain`, and that call needs a full name, native currency, RPC
URL and explorer. `@lemon/wallet` keeps viem's whole definition for each chain
rather than an id with a transport bolted on, because a partial chain object
fails that call with an error most wallets do not explain — and it is why every
enabled chain is in the wagmi config, not just the current one. X Layer in
particular is absent from most wallets' defaults, and it charges gas in **OKB**,
not ETH.

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
docker compose up                # postgres + web + the standalone API on :3003
docker compose up postgres web   # just the embedded-API stack
```

Both compose files build the image locally; there is no registry in the loop.
`docker-compose.dokploy.yml` gives all eight app services the same image name,
so Compose builds once and the rest reuse the result.

```bash
docker compose -f docker-compose.dokploy.yml build
docker compose -f docker-compose.dokploy.yml up -d
```

A release therefore compiles two browser bundles on the host that is also
serving traffic — four to six minutes, and the reason to keep the build cache
below warm. A rollback is `git checkout` of the commit you want followed by a
rebuild, rather than pinning a published tag.

**The `VITE_` values are build inputs, so they must be set on the build host.**
They are compiled into the browser bundle rather than read at runtime — a
factory address is what makes a chain appear in the network switcher at all — so
they are `build.args` in the compose file, fed from Dokploy's Environment tab or
the `.env` beside it. Leaving them unset is not a failed build: it is a working
app with an empty network switcher, found by a user rather than by you. See
`.env.example` for the full list.

**Faster rebuilds.** BuildKit already caches between builds inside the daemon;
`docker-compose.cache.yml` additionally writes that cache to a directory, so it
survives a `docker system prune`, a recreated builder or a fresh CI runner.

```bash
docker buildx create --name lemon --driver docker-container \
  --driver-opt image=moby/buildkit:latest                    # once per host
docker compose -f docker-compose.yml -f docker-compose.cache.yml build
```

It is a separate file rather than three `cache_to:` keys in `docker-compose.yml`
because cache export is a property of the *builder*, not of the compose file:
the default `docker` driver on a stock Engine rejects it outright and fails the
build, so folding it in would turn "no speedup" into "no build at all" on
exactly the host that needs it. Measured on this repo, rebuilding the
`manifests` stage with the builder's own cache wiped went from 40s to 11s.

On Dokploy, prefer the builder alone over the overlay: a `docker-container`
builder keeps its cache in its own volume, which a `docker system prune` on the
host does not reach, so pointing the build at it (`BUILDX_BUILDER=lemon` in the
Environment tab) gets the persistence without any `cache_to` to be rejected.

It does not shorten the slow half of a release. The `build` stage opens with
`COPY . .`, so any source edit rebuilds both browser bundles however warm the
cache is — building only the target that changed is what fixes that, not a
cache. `BUILDKIT_CACHE_DIR` relocates the directory, which grows without bound
under `mode=max` and is safe to delete.

## Commands

```bash
bun run dev              # the public app, with the API mounted (:3002)
bun run dev:admin        # the operator console (:3004)
bun run dev:api          # the API standalone (:3003)
bun run dev:indexer      # Ponder (:42069)
bun run dev:agent        # the vault agents
bun run dev:stack        # api + indexer + web together
bun run dev:stack api indexer web admin   # …and the console
bun run typecheck        # all workspaces
bun run lint             # biome, writing fixes
bun test                 # TypeScript tests + 128 Foundry tests
bun run contracts:test   # Foundry only
bun run test:e2e         # Playwright, against a running stack
bun run test:e2e:ui      # the same suite, interactively
bun run test:e2e:report  # the last run's HTML report
bun run contracts:build  # compile and regenerate ABIs
```

Operational, needed less often:

```bash
bun run db:generate      # Prisma client, after a schema change
bun run db:push          # schema to the database without a migration
bun run db:migrate       # create and apply one
bun run indexer:reset    # drop the read model; the next start reindexes
bun run seed:venues      # backfill venue config for vaults created outside the admin flow
```

`indexer:reset` is the answer whenever the chain underneath changes — a new
deployment, a fresh fork. Vault addresses repeat across deployments, so without
it Ponder tries to insert a primary key it already holds. It drops only the
`ponder` schema, and Prisma's tables live in `public`, so it cannot reach
sessions or operator configuration. It reaches Postgres through the compose
container, so set `POSTGRES_CONTAINER` if yours is not the default one.

## End-to-end tests

Playwright, against the running stack — nothing is mocked. The data comes from
the indexer through the real API, and the assertions read what a visitor reads.
The interesting failures in this system live *between* the contract, the indexer
and the page, and a suite that stubs any of the three cannot see them.

```bash
bun run dev:stack api indexer web admin   # :3003, :42069, :3002, :3004
bun run test:e2e
```

Every service is needed, and naming them is not optional: the argument list
*replaces* the default set rather than adding to it, so `dev:stack admin` runs
the console alone and every vault spec then fails on an empty board.

The suite also needs the indexer to have **finished its backfill**. Until it
has, `/vaults` is legitimately empty and roughly half the specs fail on a
missing row — which reads as a broken build and is a cold cache.

Read-only, and that is a real limit rather than a preference. The app trades on
Base mainnet, so there is nowhere to sign a test deposit that does not cost
money. Vault creation, deposits and the redemption queue are covered by the
Foundry suite instead.

## Watching the indexer

The console leads with the indexer's state, and it is shown even when
everything is fine — which is unusual for a status widget and is the point.

The indexer's failure mode is silence. It does not crash and it does not 500; it
answers every request with `200 []`. An empty board is then indistinguishable
from a protocol nobody has deposited into, and every other figure on the page —
TVL, the queue, agent health — is downstream of that distinction. A card that
only appeared on failure would make the healthy case look exactly like the case
where the card itself had failed to render.

Five states, and the third is the one that earns the feature:

| State | What it means |
|---|---|
| `synced` | Caught up, and holding every vault the factory has created. |
| `backfilling` | Still replaying history. Ponder answers `/ready` with a 503 until it finishes, and its tables may not exist yet. |
| `incomplete` | **Finished, and still missing vaults the chain says exist.** |
| `behind` | Finished and complete, but lagging the head. Usually a rate-limited RPC. |
| `unreachable` | Nothing is answering. |

`incomplete` is the one nothing else catches. The chain knows exactly how many
vaults the factory has created, so the read model can be checked against it
rather than taken on trust — and a shortfall there is not lag. It means a stale
`ponder` schema, a `VAULT_FACTORY_START_BLOCK` set after a vault was deployed
(which misses it permanently), or an indexer pointed at a different factory. All
three present as an empty board, none of them announce themselves, and waiting
fixes none of them. The card says so, and says which of the two variables to
check.

## Agent gas

The one running cost the protocol cannot cover for itself. An agent's EVM wallet
is an ordinary account and needs that chain's native token to send a transaction
— ETH on Base and Arbitrum, **OKB on X Layer**; the vault holds USDC and may only
ever send USDC to one address, so it cannot be funded from protocol capital — an
operator tops it up.

The derivation is chain-agnostic, so an agent's EVM address is the *same* on
every chain. That is convenient and it is also the trap: a wallet funded on Base
shows a healthy balance at an address whose Arbitrum balance is zero. Every
balance on the Gas tab is therefore read through its own chain's client, and
labelled with the chain and the unit it is actually denominated in.

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

The Gas tab shows both balances per vault and funds the EVM side directly from
the operator's wallet. Solana is shown with its address and no button: an EVM
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

**A new vault shows a dash in the realised columns, not 0%.** Those columns are
the vault's *measured* share-price change annualised. Too little history is
reported as unknown, because rendering it as zero is a claim about performance
where none exists.

**The projected column is a different kind of claim, and is labelled as one.**
It answers the question the realised columns cannot: what a vault would pay if
the current funding rate held. A vault nobody has deposited into has no measured
figure and never will until somebody goes first, and asking that person to
commit against a dash is an absence of information rather than caution. It is
net of the idle buffer, the venue round trip and both fees — skipping any of
those roughly doubles the number — and the board still *ranks* by realised
yield, because a rate that reprices hourly should not sort a list that reads as
a track record.

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
| KyberSwap | Spot routing on Base and Arbitrum | [docs.kyberswap.com](https://docs.kyberswap.com) |
| Uniswap V3 | Spot routing on X Layer, read directly from the pools | [docs.uniswap.org](https://docs.uniswap.org/contracts/v3/overview) |
| Relay | Custody chain ↔ Solana bridging | [docs.relay.link](https://docs.relay.link) |
| Ponder | Indexing every chain into the read model | [ponder.sh](https://ponder.sh) |
| OpenRouter | The agent's advisory layer | [openrouter.ai](https://openrouter.ai) |
| Coinbase | Tokenized equities (B20) on Base | [docs.base.org](https://docs.base.org) |

## Disclaimer

Not investment advice. A basis position is delta-neutral, not risk-free: funding
can turn negative, the spot leg can become illiquid, a leveraged vault's short
can be liquidated, and the vault is custodial — your USDC is held by a contract
and traded by an agent. The contracts have not been independently audited.
