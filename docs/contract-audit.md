# Contract audit — `LemonVault`, `VaultFactory`, `InsuranceFund`

Reviewed 2026-09-04 against `packages/contracts/src` at commit `76c4f09`, Base
mainnet, Solidity `^0.8.28`, OpenZeppelin 5.x. Every finding below was
reproduced as a failing Foundry test before it was fixed, and each fix ships
with the regression test that pins it.

This is an internal review, not a substitute for an independent audit.

## Assumptions

- **Privileged roles.** `DEFAULT_ADMIN_ROLE` (operator multisig, set by the
  factory), `GUARDIAN_ROLE` (pause and emergency exit), `AGENT_ROLE` (the
  vault's immutable agent wallet), `TREASURER_ROLE` on the fund. The admin can
  grant itself any of these — including `AGENT_ROLE` — which is what makes
  finding H-2 reachable from one key.
- **Upgradeability.** None. Vaults are immutable once deployed; a change means a
  new vault.
- **External dependencies.** USDC (Circle, upgradeable proxy) as the asset. No
  price oracle on-chain — the off-chain position's value is *reported* by the
  agent, which is the central trust assumption and is bounded rather than
  removed.
- **Trust model.** The agent is assumed compromisable; the contract's job is to
  bound and expose it. The admin was assumed honest — three of the findings
  below are about how little stood behind that assumption.

## Executive summary

**Overall risk before the fixes: High.** Two High findings, one of which broke a
core protocol function silently and one of which collapsed the entire agent
trust boundary from a single key.

1. `InsuranceFund.cover` — the fund's whole reason for existing — spent real
   USDC and moved the share price by nothing.
2. `setLimits` could widen every NAV bound out of existence in one transaction,
   with no timelock and no meaningful ceiling.
3. The agent's withdrawal cap tumbled at a fixed boundary, so twice the stated
   cap could leave back to back.

All three are fixed. Test count went from 115 to 128.

---

## Findings

### H-1 · `cover` pays out and does nothing — the insurance fund cannot absorb a shortfall

**Impact.** The fund transfers USDC to the vault, the share price does not move,
and the vault's books are left understating the live position by exactly the
amount paid. Depositors get nothing for the operator's money. The gap then
reappears as a *fabricated gain* at the agent's next honest NAV report, on which
the operator collects a 20% performance fee — so the fund pays twice and the
holders are made whole neither time.

**Root cause.** `cover` routed through `LemonVault.agentReturn`, which is for
capital the agent *already holds*. That function decrements `deployedAssets` by
the credited amount while idle USDC rises by the same amount, so `totalAssets`
is unchanged by construction. A donation is new capital that was never deployed;
the two operations are not the same and only one of them existed.

**Why it was not caught.** The existing test asserted the right behaviour, but
only against a vault with nothing deployed — the one situation in which a
shortfall cannot occur. With `deployedAssets == 0`, `credited` is zero and the
donation lands correctly.

**Reproduction.** Deploy 9,000 USDC of a 10,000 USDC vault, report a 500 loss,
then `cover(500)`:

```
pps after loss    950000
pps after cover   950000     <- unchanged
assets after loss 9500000000
assets after cover 9500000000 <- unchanged
deployed after    8000000000  <- silently written down from 8500
fund USDC spent   500000000
```

**Fix.** A dedicated `LemonVault.donate(uint256)` that pulls USDC without
touching `deployedAssets`, and `cover` calls it. It accrues fees *before* the
transfer, then carries the high-water mark over the donation — otherwise the
price rise a cover causes reads as performance and the operator is paid a
performance fee out of the capital it just contributed to absorb a loss.

**Tests added.** `test_CoverRaisesThePriceWhenCapitalIsDeployed`,
`test_CoverIsNotChargedAPerformanceFee`,
`test_DonateRaisesThePriceAndLeavesThePositionAlone`, `test_DonateRejectsZero`.

---

### H-2 · One admin key could dissolve the entire agent trust boundary in a single transaction

**Impact.** Complete loss of the vault's idle USDC and of every subsequent
deposit. The NAV bounds are the whole trust boundary for a design where the
position is genuinely off-chain — and they could be widened out of existence
faster than anyone could read the event.

**Exploit.** `setLimits` is `onlyRole(DEFAULT_ADMIN_ROLE)`, takes effect
immediately, and `_validateLimits` bounded almost nothing that mattered:

| Parameter | Old ceiling | What that allowed |
|---|---|---|
| `maxNavDeviationBps` | `10_000` (100%) | Double the reported valuation per report |
| `maxNavEpochDeviationBps` | `10_000` (100%) | No cumulative bound either |
| `navEpochDuration` | `!= 0` | One second — the anchor re-reads `deployedAssets` on rollover, so the epoch bound decays into the per-report bound, compounding |
| `minNavReportInterval` | unchecked | No rate limit |
| `minRedeemDelay` | `<= maxRedeemDelay` | Zero — convert the inflated shares to cash in the same block |
| `maxDeployedBps` | `10_000` | Deploy the entire vault, leaving no buffer |
| `agentWithdrawWindowCap` | unchecked | Any amount |

The admin can also `grantRole(AGENT_ROLE, self)`, so this needs one key, not
two. Reproduced: NAV doubling every second, share price up >10x in five reports,
performance-fee shares minted against the fiction.

**Fix.** Protocol ceilings the admin cannot cross, set well above every template
the protocol ships (3–8% per report, 15–35% per epoch), so they bind a hostile
configuration rather than an unusual market:

```solidity
MAX_NAV_DEVIATION_BPS       = 2000;   // 20% in one report
MAX_NAV_EPOCH_DEVIATION_BPS = 5000;   // 50% in one epoch
MIN_NAV_EPOCH_DURATION      = 1 hours;
MIN_REDEEM_DELAY            = 1 days;
MAX_DEPLOYED_BPS            = 9500;   // a queue buffer always remains
```

Plus `maxNavStaleness > minNavReportInterval`, without which a vault can be
configured so the agent is forbidden from reporting until after the vault has
already frozen — blocking deposits and fulfilments with no way back.

This bounds the worst case to "slow and observable", which is what the contract
already claimed. It does not make the admin trustless: a multisig and a timelock
in front of `setLimits` remain the operational control, and are recommended
before mainnet.

**Tests added.** Six, in `LemonVault.risk.t.sol`, one per parameter, plus
`test_ShippedLimitsRemainValid` so the production templates cannot drift outside
their own ceilings unnoticed.

---

### M-1 · The agent withdrawal cap tumbled, allowing a 2× burst across its boundary

**Impact.** Twice the stated per-window cap could leave the vault inside two
seconds — the last second of one window and the first of the next. The cap
exists precisely to make capital leave slowly.

**Root cause.** The counter reset wholesale at a fixed boundary. The comment
described it as a rolling window; it was a tumbling one.

**Fix.** A leaky bucket: the counter decays in proportion to elapsed time, so
the allowance refills at `cap / window` and no interval of one window's length
can carry more than the cap. A full window's wait still refills it completely —
the bucket leaks, it does not seize.

**Tests added.** `test_WindowCapHoldsAcrossItsOwnBoundary`,
`test_WindowCapRefillsOverAFullWindow`.

---

## Not fixed — accepted, with reasons

- **`agentReturn` is callable by anyone, and reduces `navEpochAnchor`.** A
  griefer can tighten the epoch bound by donating USDC, potentially rejecting
  the agent's honest report and staling the vault. Bounded: the DoS lasts at
  most one `navEpochDuration` (the anchor resets on rollover before the bound is
  checked), and it costs the attacker real USDC that goes to the depositors.
  Open access is deliberate — a rotated or revoked key must still be able to
  hand the money back.
- **Fee dust cannot strand funds.** Repeated partial `redeem` calls can round
  `claimableShares` to zero with `claimableAssets` left over; `withdraw` still
  pays it out, so nothing is lost.
- **A dormant vault charges no management fee.** `_mintFeeShares` returns zero
  when `feeAssets >= totalAssets`, which is the safe reading of an absurd
  elapsed time. Favours users.
- **`pricePerShare()` on an empty vault with dust reports a large number.** A
  view-only artefact of the 10^12 decimals offset; `_accrueFees` resets the
  high-water mark to par at zero supply, so nothing is charged on it.

## Checklist

| Area | Verdict | Note |
|---|---|---|
| Access control | **Pass** (was Fail) | Roles correct throughout; the admin's *parameter* power was the gap, now bounded |
| Reentrancy | **Pass** | CEI observed; `_claim` transfers after state. `agentReturn`/`donate` pull before writing, safe for USDC |
| Arithmetic | **Pass** | Solidity 0.8 checked maths, `mulDiv` with explicit rounding, virtual shares at 10^12 |
| External calls | **Pass** | `SafeERC20` throughout; `forceApprove` reset to zero after `cover` |
| Upgradeability | **N/A** | No proxy |
| Oracle dependencies | **Pass, by design** | No oracle; the agent's report is the input, bounded per report and per epoch |
| MEV exposure | **Pass** | Exit price fixed at fulfilment, not request — no free option on other holders' capital |
| ERC compliance | **Pass** | ERC-4626 + ERC-7540 async redeem; sync previews revert as the standard requires |
| Contract size | **Pass** | `VaultFactory` 22,758 B, 1,818 B under EIP-170. The fixes cost 111,754 gas of Vibenet's 6M constructor headroom |

## Recommendation

**Conditional Go.**

Ship-blocking, and done:

1. ~~`cover` must actually move the share price~~ — fixed, H-1.
2. ~~The NAV bounds must not be removable in one transaction~~ — fixed, H-2.
3. ~~The withdrawal cap must hold across its own boundary~~ — fixed, M-1.

Still required before mainnet, and outside this change:

4. **A timelock in front of `setLimits` and `setInsuranceFund`.** The ceilings
   bound the damage; a delay is what makes it visible before it lands.
5. **`DEFAULT_ADMIN_ROLE` on a multisig**, not an EOA — the factory grants
   whatever `vaultAdmin` is, and it is a single address today.
6. **An independent audit.** This review was performed by the same party that
   wrote the fixes.
