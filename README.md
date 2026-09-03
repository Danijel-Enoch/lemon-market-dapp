# Lemon Markets

Trade crypto, tokenized equities, FX, commodities and metals on **Base** — leveraged perps, spot, delta-neutral cash-and-carry, and multi-market baskets. Everything settles in USDC.

Spot, baskets and cash-and-carry are non-custodial: the app builds transactions
and payloads, your wallet signs them. Perps trade on Pacifica through an account
the app derives for you — see **Accounts** below for exactly what that means.

## What it does

| | |
|---|---|
| **Perps** | Every market Pacifica lists — 76 across crypto, US equities, FX majors, commodities and metals. Market and limit orders. Orders are signed server-side by an agent key you authorise once, so trading costs no wallet prompt and no gas. |
| **Spot** | Real tokens on Base routed through the KyberSwap aggregator, with gasless off-chain limit orders. The tradable set is restricted to underlyings Avantis also lists, so anything you can hold you can also hedge. |
| **Cash & carry** | Buy the spot token, short the matching perp at equal notional, collect funding. Works on crypto and tokenized equities. |
| **Baskets** | Enter several correlated markets at once, equally weighted, with a composite index chart. Available as perp, spot, or carry. |

Cross-chain deposits via Relay are built (`packages/relay`, `/api/deposit/*`) but
the UI surface is not enabled — fund the wallet with USDC on Base directly.

## Architecture

Bun workspaces:

```
apps/
  web/        React Router v7 SSR app, served by Elysia
  api/        Elysia API — mounted in-process by web, or run standalone
packages/
  core/       Shared types, unit conversion, symbol normalisation
  near-mpc/   NEAR chain-signature address derivation and Ed25519 signing
  pacifica/   Perp REST client, request signing, Solana deposit instruction
  avantis/    tx-builder, data service and price feed clients
  kyber/      Aggregator + limit-order clients
  relay/      Deposit addresses and status
  registry/   Token registry, basket definitions, carry maths
  db/         Prisma schema and client
```

`apps/api` exports a mountable Elysia plugin. The web server mounts it, so one
container serves both — but it also has its own entrypoint, so splitting the API
onto its own host later needs no code change.

Secrets (`RELAY_API_KEY`, `KYBER_CLIENT_ID`, RPC URLs) live server-side and never
reach the browser bundle.

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

Cash-and-carry and baskets still trade Avantis perps on Base; they are unchanged.

## Running it

```bash
bun install
cp .env.example .env          # works as-is; see notes below
bun run db:generate           # generate the Prisma client
bun run dev                   # http://localhost:3002
```

Market data, charts and the connected-wallet view work with no configuration.
Two features are gated:

- **Cash & carry** needs `DATABASE_URL` — a carry spans two independent systems
  and its state has to survive a reload.
- **Accounts and perp trading** need `DATABASE_URL`, `AUTH_SECRET` and a funded
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
- **Perp (Pacifica)** — `PACIFICA_BUILDER_CODE` + `PACIFICA_BUILDER_MAX_FEE_RATE`.
  Users approve the code during onboarding; orders they placed before approving
  are unattributed. See **Accounts** above.

- **Perp (Avantis, used by carry and baskets)** — `AVANTIS_BUILDER_CODE`. The rate and collector are **not** set
  here: they live on-chain in the Avantis BuilderCode registry, which you
  register once. Orders are attributed by an ERC-8021 calldata suffix.

  One caveat before relying on it: attribution is a calldata suffix, and on the
  gasless path the Avantis operator builds its own calldata, so the suffix never
  reaches the chain and no builder fee accrues. Gasless is the default, so send
  orders with `gasless: false` when you want them attributed. `/api/perp/open`
  and `/api/perp/close` return an `attributed` flag saying which happened.

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

**Funding sign is inverted from most venues.** Avantis documents it as *"a
positive rate means you receive, negative means you pay."* A cash-and-carry
holds the short side, so it only earns when the short rate is positive — which
happens when longs are crowded. The app shows the real sign and warns when a
carry would cost money.

**Most tokenized equities are not buyable.** Only some have Aerodrome pools on
Base, and the set changes. Routability is probed live rather than configured, so
tokens show as buyable, sell-only, or unavailable instead of failing at signing
time.

**Price impact on stock pools is material.** Over 1% on a $100 trade is normal
given the depth. It is shown as a headline number on the order panel.

**Pair indexes are never hardcoded.** Avantis pair indexes are not stable across
protocol versions — v1 documented BTC at index 0, live v2 returns ETH there —
so every market is resolved by symbol at call time.

**Baskets are N separate trades.** There is no atomic multi-market order, so a
basket can partially fill. Each leg reports its own outcome.

**A half-open carry is recoverable, not failed.** If the spot buy lands and the
short does not, the position is marked as needing attention and offers to
complete the short or unwind the spot — it is never silently abandoned.

## External services

| Service | Used for | Docs |
|---|---|---|
| Avantis | Perps, funding, OHLCV | [sdk.avantisfi.com](https://sdk.avantisfi.com) |
| KyberSwap | Spot routing, limit orders | [docs.kyberswap.com](https://docs.kyberswap.com) |
| Relay | Cross-chain deposits (API only, UI disabled) | [docs.relay.link](https://docs.relay.link) |
| Coinbase | Tokenized equities (B20) on Base | [docs.base.org](https://docs.base.org) |

## Disclaimer

Not investment advice. Leverage can liquidate your position. Tokenized equities
are issued by third parties, may carry transfer restrictions, and are not
available everywhere.
