# Lemon

A basis trading platform on **Base**. One product: delta-neutral spot-versus-perp
positions on tokenized stocks and crypto. Buy the spot token, short the matching
perp at equal notional, collect funding. Everything settles in USDC.

The spot leg is non-custodial — the app builds the transaction, your wallet
signs it, and the token lands in your own wallet. The short leg trades on
Pacifica through an account the app derives for you; see **Accounts** below for
exactly what that means.

## What it does

| | |
|---|---|
| **The board** | Every pair where both legs exist, ranked by net yield after costs. Untradable markets stay listed with the reason rather than disappearing. |
| **A market** | Live spread, funding, both legs side by side, the perp chart, and a ticket that re-quotes at the size you actually type. |
| **A position** | Both legs opened in one flow and tracked as one object, with recovery when a leg fails. |
| **Funding** | USDC on Base for the spot leg; a bridged, MPC-signed deposit for the perp leg's margin. |

Only spot-versus-perp today. Perp-versus-perp is not built.

## The universe

A basis market exists only where **both** legs do: a Base ERC-20 the aggregator
can route into, paired by ticker with a listed Pacifica perp on the same
underlying.

That currently resolves to the Coinbase B20 tokenized equities on Base — NVDA,
GOOGL, TSLA, MSTR and the rest — plus the Base tokens with a listed perp: BTC via
cbBTC, ETH via WETH, SOL, LINK, AAVE, CRV, ENA, ZRO, VIRTUAL, VVV and KAITO.

The pairing runs on every request, so a spot asset with no perp yet — AERO, AAPL,
MSFT, META, COIN, AMZN, INTC — is reported as *waiting on a perp listing* rather
than dropped, and promotes itself the moment the venue lists one. No deploy.

Curation is by hand and by asset, never by ticker match. A plain symbol lookup
against a Base token list returns an unrelated Base-native token for FARTCOIN, a
governance token for DOGE, and a different issuer's tokenized stock for STRK —
each of which would hedge a position against the wrong asset while looking
perfectly healthy.

## What the numbers mean

Every row is quoted at `REFERENCE_NOTIONAL_USD` (currently $1,000) per leg at 2x,
so rows are comparable — and the liquidity probe trades **exactly that size**, so
the slippage priced into a row is slippage measured at the size the row claims.
Probing smaller than you quote understates the cost of precisely the thin pools
where it matters most.

- **Net APY** — funding on deployed capital, minus the full round trip amortised
  over a year. This is what the board ranks on.
- **Funding APR** — the gross number before costs. The two disagree often enough
  to matter, which is why the gross one does not lead.
- **Spread** — perp mark against the spot **mid**, with the probe's own impact
  backed out. Quoting the raw fill price instead makes every market appear to
  trade at a discount by exactly the pool's slippage — an artifact uniform enough
  to look like a real basis.
- **Breakeven** — days of funding at today's rate to cover the round trip.

Fees are **0.1% per leg per fill**. A round trip crosses both legs twice, so it
costs **0.4% of notional** before slippage — which is why a position has a
minimum sensible holding period, and why markets paying less than that
annualised show a negative net APY rather than being hidden.

A market is blocked, with its reason shown, when the spot leg has no route, when
a probe-sized trade moves the pool more than 10%, or when the two legs disagree
on price by more than 5% — a double-digit "spread" is not an opportunity, it is
one of the two prices being wrong.

## Architecture

Bun workspaces:

```
apps/
  web/        React Router v7 SSR app, served by Elysia
  api/        Elysia API — mounted in-process by web, or run standalone
packages/
  core/       Shared types, unit conversion, fee constants
  near-mpc/   NEAR chain-signature address derivation and Ed25519 signing
  pacifica/   Perp REST client, request signing, Solana deposit instruction
  kyber/      Aggregator client
  relay/      Deposit addresses and status
  registry/   Spot-asset registry, pairing, basis maths and state machine
  db/         Prisma schema and client
```

`apps/api` exports a mountable Elysia plugin. The web server mounts it, so one
container serves both — but it also has its own entrypoint, so splitting the API
onto its own host later needs no code change.

Secrets (`RELAY_API_KEY`, `KYBER_CLIENT_ID`, RPC URLs) live server-side and never
reach the browser bundle.

## API

Market data needs no key; anything touching a position needs a session cookie.

```
GET  /api/basis/markets              # the board, ranked, with blockers and unpaired assets
GET  /api/basis/markets/:id          # one market, by ticker or either leg's symbol
GET  /api/basis/markets/:id/candles  # OHLCV for the perp mark (not the spread — see below)
POST /api/basis/plan                 # price a position at real size; commits to nothing
GET  /api/basis/positions?user=0x…   # positions for an address
```

There is deliberately no discretionary perp-order endpoint. Pacifica nets
positions per symbol, so a standalone order in a symbol a user already holds a
basis in would cancel that position's hedge while the database went on
describing it as delta-neutral.

Candles are the perp mark, not the basis spread, and say so in the response. No
venue publishes a price history for a tokenized equity on Base, so a spread
series would have to be reconstructed from our own snapshots — a line that would
look authoritative and be mostly invented.

## Accounts

Perps live on Pacifica, which is a Solana venue, while the wallet you connect
with is on Base. Bridging that gap is what sign-in does.

**Two signatures, once.**

1. **Sign in.** Proves you control the connected wallet, and derives an EVM and a
   Solana wallet for you through [NEAR chain signatures](https://docs.near.org/chain-abstraction/chain-signatures).
   The private keys do not exist anywhere — the NEAR MPC network signs on
   request, and the addresses are a deterministic function of your wallet
   address, so they are reproducible rather than stored secrets.
2. **Activate trading.** Authorises one named agent key to place and cancel
   orders on your Pacifica account. The message you sign names that exact key.
   It cannot withdraw: Pacifica requires the account key for withdrawals, which
   is what stops a compromised server from emptying an account.

After that, orders are signed server-side with the agent key. No wallet prompt
per trade, no gas.

If `PACIFICA_BUILDER_CODE` is set, step 2 also approves your builder code, so
collecting a fee costs no extra prompt — but the fee is named in the message the
user signs and in the onboarding panel, because that dialog is the only place
they can see what they are agreeing to.

One asymmetry worth knowing: Pacifica **rejects** an order whose builder fee
exceeds the ceiling the user approved, rather than filling it unattributed. The
app therefore attaches your code only to users who approved this code at a
ceiling that still covers it, and prompts everyone else. Raising your registered
rate past an approved ceiling costs the fee until those users re-approve; it
never costs them a trade.

The derived wallets are deliberately never shown. They are plumbing, and money
sent straight to one is money outside Pacifica that nothing will credit. Funding
goes through the accounts page instead: USDC leaves your connected wallet,
Relay bridges it to Solana, and a second transaction — signed by your derived
wallet through MPC — deposits it into Pacifica's custody program. Those two
steps are shown separately, because between them the funds have left one place
and not yet arrived at the other.

The short leg is placed server-side with your agent key, so it costs no wallet
signature — which is what used to leave positions half-open when a user closed
the tab between the two legs.

## Running it

```bash
bun install
cp .env.example .env          # works as-is; see notes below
bun run db:generate           # generate the Prisma client
bun run dev                   # http://localhost:3002
```

Market data, charts and the connected-wallet view work with no configuration.
Two features are gated:

- **Opening positions** needs `DATABASE_URL` — a position spans two independent
  systems and its state has to survive a reload.
- **Accounts and the hedge leg** need `DATABASE_URL`, `AUTH_SECRET` and a funded
  NEAR account (`NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`). Crediting deposits
  additionally needs `SOLANA_FEE_PAYER_SECRET`, since a derived wallet holds
  USDC but no SOL to pay its own transaction fee. `GET /api/auth/status` says
  which piece is missing.

Run `bun run db:push` after setting `DATABASE_URL`.

It reports itself as unavailable in the UI rather than failing quietly. The
deposit endpoints additionally need a free `RELAY_API_KEY` from
[dashboard.relay.link](https://dashboard.relay.link) if you re-enable that page.

### Charging your own fees

Spot and perp collect fees by different mechanisms, so they are configured
separately — see `.env.example` for the full notes.

- **Spot** — `SPOT_FEE_BPS` + `SPOT_FEE_RECEIVER` (and optionally
  `SPOT_FEE_CHARGE_BY`). KyberSwap takes the cut inside the route, so the quote
  the user is shown is already net of it. Both values are required; one without
  the other is treated as no fee.
- **Perp** — `PACIFICA_BUILDER_CODE` + `PACIFICA_BUILDER_MAX_FEE_RATE`. Users
  approve the code during onboarding; orders placed before they approve are
  unattributed. Pacifica *rejects* an order whose builder fee exceeds the
  ceiling a user approved rather than filling it unattributed, so set the
  ceiling above the rate you actually charge. See **Accounts** above.

### Docker

```bash
docker compose up                    # postgres + web (API embedded)
docker compose --profile split up    # + standalone API on :3003
```

## Commands

```bash
bun run dev          # web app with the API mounted
bun run dev:api      # standalone API
bun run build        # production build
bun run typecheck    # all workspaces
bun run lint         # biome
bun test             # unit tests
bun run db:migrate   # create a migration
bun run db:seed      # seed the token registry (verifies decimals on-chain)
```

## Things worth knowing

These are behaviours that look like bugs but are not.

**Funding sign is inverted from most venues.** Pacifica quotes one hourly rate
where a *positive* number means longs pay shorts; the app splits it by side, so
a figure shown against your side is what you receive. A basis position holds the
short side, so it only earns when the short rate is positive — which happens when
longs are crowded. The app shows the real sign and warns when a position would
cost money.

**Most tokenized equities are not buyable.** Only some have Aerodrome pools on
Base, and the set changes. Routability is probed live rather than configured, so
tokens show as buyable, sell-only, or unavailable instead of failing at signing
time.

**Price impact on stock pools is material.** Several percent on a probe-sized
trade is normal given the depth, and it is charged to the position on both entry
and exit rather than quietly omitted. The aggregator's impact figure is also
noisy on small trades — it reads 2%+ on cbBTC and SOL, among the deepest pools on
Base — which is why the "no depth" threshold is loose and the price-divergence
check does the real work.

**Markets are addressed by symbol, never by index.** Venue pair indexes are not
stable across protocol versions, so a persisted index can end up naming a
different asset after an upgrade — and trade it without complaint. Every market
is resolved by symbol at call time.

**Equity markets never close here, but their underlying does.** Pacifica
publishes no session hours, so both legs trade continuously. What stops
overnight and at weekends is the cash market that prices the underlying — so the
spread can widen on thin flow and reprice at the open. That is a real risk, but
it is not the "one leg is frozen" risk a venue with session hours would carry,
and the app does not describe it as one.

**A half-open position is recoverable, not failed.** If the spot buy lands and
the short does not, the position is marked as needing attention and offers to
complete the short or unwind the spot — it is never silently abandoned.

## External services

| Service | Used for | Docs |
|---|---|---|
| Pacifica | Perps, funding, OHLCV, custody | [docs.pacifica.fi](https://docs.pacifica.fi) |
| NEAR | Chain signatures for derived wallets | [docs.near.org](https://docs.near.org/chain-abstraction/chain-signatures) |
| KyberSwap | Spot routing and liquidity probes | [docs.kyberswap.com](https://docs.kyberswap.com) |
| Relay | Cross-chain deposits (API only, UI disabled) | [docs.relay.link](https://docs.relay.link) |
| Coinbase | Tokenized equities (B20) on Base | [docs.base.org](https://docs.base.org) |

## Disclaimer

Not investment advice. A basis position is delta-neutral, not risk-free: the
short leg is leveraged and can be liquidated, funding can turn negative, and the
spot leg can become illiquid before you exit. Tokenized equities are issued by
third parties, may carry transfer restrictions, and are not available
everywhere.
