# @lemon/contracts

The custody layer. Users deposit USDC here and are minted shares; an off-chain
agent takes the capital, runs one basis position with it, and reports back.

```
LemonVault      ERC-4626 deposits + ERC-7540 async redeem. Holds the money.
VaultFactory    One vault per market, one agent per vault. The admin's write path.
InsuranceFund   Receives every fee as shares. Can donate into a vault to cover a loss.
```

## What is on-chain and what is not

On-chain: custody of idle USDC, share accounting, the redemption queue, fee
accrual, and the limits that bound the agent key.

Not on-chain: which trades to place, when, and what the position is worth. Those
need Pacifica and Kyber data that Base cannot read. So the vault's valuation has
exactly one unverifiable input — `reportNav` — and most of `LemonVault.sol` is
about bounding it.

## The trust boundary

A stolen agent key must not be able to empty a vault. Four limits stand in the way:

| Limit | What it stops |
|---|---|
| `agentWallet` is **immutable** | The agent cannot name a recipient. `agentWithdraw` takes an amount and nothing else. |
| `maxDeployedBps` + rolling window cap | Capital leaves slowly and never entirely; an idle buffer always remains for the queue. |
| `maxNavDeviationBps` (per report) and `maxNavEpochDeviationBps` (per day) | One call cannot reprice the vault, and a drip of small reports cannot do slowly what one call may not do at once. |
| `GUARDIAN_ROLE` pause + `emergencyExit` | A human can stop the agent. Pausing never blocks a user from queueing an exit. |

None of this makes the agent trustless. It makes its worst case bounded and
observable, which is the honest ceiling for a design where the position really
is off-chain.

## Withdrawals take 3–7 days, and why that shape

`requestRedeem` **escrows** shares rather than burning them. They stay part of
`totalSupply`, so a requester keeps full exposure until the agent actually
unwinds. Pricing the exit at request time would hand them a free option on
everyone else's capital while the agent spends days closing a leveraged hedge.

`fulfillRedeem` prices the exit at the **contract's** current share price. The
agent supplies only which request and how many shares — never the payout. That
matters: the NAV report is already bounded, and letting the agent also choose the
amount would have made those bounds bypassable one redemption at a time.

`minRedeemDelay` (3 days) is enforced. `maxRedeemDelay` (7 days) is an SLA
surfaced in `RedeemQueued` and `redeemStateOf` for monitoring — a contract cannot
make an off-chain agent act, but it can make lateness visible.

Topping up a pending request **restarts** its delay. Requests merge under one id,
so keeping the earliest timestamp would let a one-wei request ripen for three
days and then carry an arbitrarily large addition out with it.

## Fees

2% a year on assets, 20% of gains above a high-water mark, both minted as
**shares** to the insurance fund. Shares rather than a USDC transfer because the
vault is usually deployed and there is often no USDC here to pay with — and
diluting takes the fee out of the gain rather than out of the position's working
capital.

Management accrues first. Taking it after the performance fee would pay the
operator a share of assets it is about to charge itself as rent.

Fee shares are priced to be worth exactly `feeAssets` **after** the mint dilutes
the pool that pays them:

```
shares = feeAssets * supply / (assets - feeAssets)
```

The obvious `convertToShares(feeAssets)` prices them before they exist and lands
a 2% schedule at about 1.96%. The number in the docs and the number charged have
to be the same number.

## Risk tiers

Set once, at creation, and immutable — changing a vault's leverage afterwards
would substitute a different product for the one people deposited into.

| Tier | Target | Ceiling | Meaning |
|---|---|---|---|
| `CONSERVATIVE` | 1x | 1x | Fully collateralised short. No liquidation price. |
| `LEVERAGED` | 2x | up to 3x | Funding yield multiplied, liquidation price introduced. |

`CONSERVATIVE` is validated as *exactly* 1x with no headroom, and `LEVERAGED` is
rejected at 1x — otherwise the labels do no work. No vault may exceed 3x.

Base cannot measure leverage on a Solana account, so `reportNav` carries the
agent's observed leverage and **rejects** a report above the ceiling. That is
worth more than it sounds: an agent that stops reporting goes stale, and a stale
vault blocks its own deposits and redemptions. Breaching the mandate therefore
means either stating a number the contract refuses or freezing your own vault.
Both are loud.

## The public activity feed

`reportActivity` records everything the agent does, on whichever chain it did it
— spot fills, perp opens and closes, bridges in both directions, venue deposits,
funding settlement. `reportActivityBatch` keeps one decision's several legs in a
single block, so the feed cannot show a bridge with no arrival.

`txRef` is `bytes`, not `bytes32`, because a Solana signature is 64 bytes and a
truncated one links to nothing — which would make the perp half of the feed
exactly the half nobody can check.

These are **attestations, not proofs**; nothing here is verified on-chain and it
cannot be. What makes them useful is that each names a real transaction on a
public chain, so an indexer can fetch it and check that it exists, moved what is
claimed, and involved the agent's own wallet. A false report is not merely
unproven — it is refutable by anyone, permanently.

## Commands

```bash
forge build          # compile
bun run abi          # regenerate ts/abi.ts from the artifacts
forge test           # 112 tests
forge test --gas-report
forge coverage
FOUNDRY_PROFILE=ci forge test   # 5,000 fuzz runs, deeper invariants
```

Deployment needs `VAULT_ADMIN_ADDRESS`, `VAULT_GUARDIAN_ADDRESS` and
`INSURANCE_TREASURER_ADDRESS`:

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_RPC_URL --broadcast --verify
```

The script deploys the fund and the factory only. Vaults are created from the
admin dashboard, because a vault needs an agent wallet and that wallet is derived
per-vault from the NEAR MPC network — the derivation and the transaction have to
happen together.

## Tests

| Suite | Covers |
|---|---|
| `LemonVault.deposit.t.sol` | Share maths, decimals offset, inflation attack, stale/paused gating |
| `LemonVault.agent.t.sol` | Every agent limit, written from the attacker's side |
| `LemonVault.redeem.t.sol` | The full ERC-7540 lifecycle, operators, queue griefing |
| `LemonVault.fees.t.sol` | 2%/20% exactness, high-water mark, ordering |
| `LemonVault.risk.t.sol` | Both tiers, what cannot be created, runtime enforcement |
| `VaultFactory.t.sol` | Uniqueness invariants, wiring, insurance fund |
| `LemonVault.invariant.t.sol` | Solvency and reconciliation across random action sequences |

`forge test` reports `block.timestamp` lint warnings. They are expected: this
contract measures delays in days, and validator drift of a few seconds cannot
move a three-day boundary in any way that matters.

## Dependencies

OpenZeppelin 5.6 comes from npm (hoisted to the workspace root by bun).
`forge-std` is a git submodule pinned to `v1.11.0` — the npm mirror is an
unofficial, stale republish, which is not a dependency a contract holding funds
should have. After a fresh clone:

```bash
git submodule update --init --recursive
```
