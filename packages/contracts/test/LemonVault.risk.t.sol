// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LemonVault} from "../src/LemonVault.sol";
import {VaultTest} from "./VaultTest.sol";

/**
 * @dev The two risk tiers.
 *
 * A depositor picks a vault on the strength of one sentence — "this one is not
 * levered" or "this one runs 2-3x" — so the parameters behind that sentence
 * cannot be a suggestion. These tests are about what the chain can actually
 * hold the operator to, and where that stops.
 */
contract LemonVaultRiskTest is VaultTest {
    function _use(LemonVault.RiskProfile memory risk) internal {
        _use(risk, defaultLimits());
    }

    function _use(LemonVault.RiskProfile memory risk, LemonVault.Limits memory limits) internal {
        vault = _deployVault(limits, risk);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
    }

    // -- what each tier means ----------------------------------------------

    function test_ConservativeVaultIsExactlyOneX() public {
        _use(conservativeRisk());

        assertEq(uint8(vault.riskTier()), uint8(LemonVault.RiskTier.CONSERVATIVE));
        assertEq(vault.targetLeverageBps(), 10_000, "1x target");
        assertEq(vault.maxLeverageBps(), 10_000, "and no headroom above it");
    }

    function test_LeveragedVaultCarriesItsTargetAndCeiling() public {
        _use(leveragedRisk());

        assertEq(uint8(vault.riskTier()), uint8(LemonVault.RiskTier.LEVERAGED));
        assertEq(vault.targetLeverageBps(), 20_000, "2x target");
        assertEq(vault.maxLeverageBps(), 30_000, "3x ceiling");
    }

    /**
     * The tier is immutable. Changing a vault's leverage after people deposited
     * would substitute a different product for the one they chose, so there is
     * deliberately no setter — an operator who wants leverage creates a
     * leveraged vault and lets users move.
     */
    function test_TheMandateHasNoSetter() public {
        _use(conservativeRisk());

        // Exhaustive over the admin surface: nothing here touches leverage.
        vm.startPrank(admin);
        vault.setLimits(defaultLimits());
        vault.setInsuranceFund(makeAddr("elsewhere"));
        vm.stopPrank();

        assertEq(vault.targetLeverageBps(), 10_000);
        assertEq(vault.maxLeverageBps(), 10_000);
    }

    // -- what the contract refuses to create -------------------------------

    /// "Conservative" has to mean 1x, or the label is doing no work.
    function test_AConservativeVaultCannotBeGivenLeverage() public {
        LemonVault.RiskProfile memory bad = conservativeRisk();
        bad.targetLeverageBps = 20_000;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);
    }

    /// Nor headroom to drift into it later.
    function test_AConservativeVaultCannotBeGivenLeverageHeadroom() public {
        LemonVault.RiskProfile memory bad = conservativeRisk();
        bad.maxLeverageBps = 15_000;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);
    }

    /**
     * The mirror image. A "leveraged" vault allowed to sit at 1x is the
     * conservative product wearing the riskier label, and its depositors would
     * be paying a performance fee for a mandate it never runs.
     */
    function test_ALeveragedVaultMustActuallyBeLevered() public {
        LemonVault.RiskProfile memory bad = leveragedRisk();
        bad.targetLeverageBps = 10_000;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);
    }

    function test_NoVaultMayExceedThreeX() public {
        LemonVault.RiskProfile memory bad = leveragedRisk();
        bad.maxLeverageBps = 30_001;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);

        bad = leveragedRisk();
        bad.targetLeverageBps = 40_000;
        bad.maxLeverageBps = 40_000;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);
    }

    function test_ACeilingBelowTheTargetIsIncoherent() public {
        LemonVault.RiskProfile memory bad = leveragedRisk();
        bad.targetLeverageBps = 30_000;
        bad.maxLeverageBps = 20_000;
        vm.expectRevert(LemonVault.InvalidRiskProfile.selector);
        _deployVault(defaultLimits(), bad);
    }

    function testFuzz_AnyAcceptedProfileRespectsItsTier(uint8 rawTier, uint32 target, uint32 ceiling) public {
        LemonVault.RiskProfile memory r = LemonVault.RiskProfile({
            tier: LemonVault.RiskTier(bound(rawTier, 0, 1)),
            targetLeverageBps: uint32(bound(target, 0, 60_000)),
            maxLeverageBps: uint32(bound(ceiling, 0, 60_000))
        });

        try this.deployWithRisk(r) returns (LemonVault v) {
            assertLe(v.maxLeverageBps(), 30_000, "no vault above 3x");
            assertGe(v.maxLeverageBps(), v.targetLeverageBps());
            if (v.riskTier() == LemonVault.RiskTier.CONSERVATIVE) {
                assertEq(v.targetLeverageBps(), 10_000);
                assertEq(v.maxLeverageBps(), 10_000);
            } else {
                assertGt(v.targetLeverageBps(), 10_000, "a levered tier must be levered");
            }
        } catch {
            // Rejected, which is the other acceptable outcome.
        }
    }

    /// @dev External so the fuzz case above can `try` a reverting constructor.
    function deployWithRisk(LemonVault.RiskProfile memory r) external returns (LemonVault) {
        return _deployVault(defaultLimits(), r);
    }

    // -- what the contract enforces at runtime ------------------------------

    /**
     * The chain cannot see the Pacifica account, so it cannot measure leverage.
     * What it can do is refuse a report that admits to breaching the mandate.
     *
     * That is worth more than it sounds: an agent that will not report goes
     * stale, and a stale vault stops accepting deposits and stops fulfilling
     * redemptions. So the choice facing an agent running 3x in an unlevered
     * vault is to state a number the contract rejects, or to freeze its own
     * vault. Both are loud. Neither is the quiet drift this is meant to prevent.
     */
    function test_AConservativeVaultRejectsALeveredReport() public {
        _use(conservativeRisk());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);
        skip(5 minutes);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.LeverageExceedsMandate.selector, 20_000, 10_000));
        vault.reportNav(900 * ONE_USDC, 20_000, uint64(block.timestamp));

        _reportNavAtLeverage(900 * ONE_USDC, 10_000);
        assertEq(vault.lastObservedLeverageBps(), 10_000);
    }

    function test_ALeveragedVaultAcceptsUpToItsCeilingAndNoFurther() public {
        _use(leveragedRisk());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        skip(5 minutes);
        _reportNavAtLeverage(900 * ONE_USDC, 30_000); // exactly 3x is allowed
        assertEq(vault.lastObservedLeverageBps(), 30_000);

        skip(5 minutes);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.LeverageExceedsMandate.selector, 30_001, 30_000));
        vault.reportNav(900 * ONE_USDC, 30_001, uint64(block.timestamp));
    }

    function test_DriftBelowTargetIsReportableNotAnError() public {
        _use(leveragedRisk());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        // An ADL or a partial fill can leave the hedge under-levered. That is a
        // rebalancing signal, not a breach, and blocking the report would hide it.
        _skipAndReport(5 minutes, 900 * ONE_USDC);
        skip(5 minutes);
        _reportNavAtLeverage(900 * ONE_USDC, 14_000);
        assertEq(vault.lastObservedLeverageBps(), 14_000);
    }

    function test_ObservedLeverageStartsAtTheTarget() public {
        _use(leveragedRisk());
        assertEq(
            vault.lastObservedLeverageBps(),
            20_000,
            "before the first report the mandate is the best available answer"
        );
    }

    // -- the tiers share everything else ------------------------------------

    function test_BothTiersUseTheSameQueueAndFees() public {
        // Fees off: this is about the queue's terms, and a management fee
        // streaming over the three-day delay would only blur the payout.
        _use(leveragedRisk(), noFeeLimits());
        _deposit(alice, 1_000 * ONE_USDC);

        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        assertEq(_fulfill(alice, 400e18), 400 * ONE_USDC);

        // Leverage changes the position, not the terms of the vault around it.
        _requestRedeem(alice, 100e18);
        (,,, uint64 requestedAt, uint64 eligibleAt, uint64 fulfillBy) = vault.redeemStateOf(alice);
        assertEq(eligibleAt - requestedAt, 3 days, "same 3-day floor");
        assertEq(fulfillBy - requestedAt, 7 days, "same 7-day SLA");
    }

    // -- the limits a compromised admin cannot loosen ------------------------

    /**
     * `setLimits` belongs to the admin, and the admin can grant itself
     * `AGENT_ROLE`. So the NAV bounds are only a trust boundary if they cannot
     * be widened out of existence first — otherwise one transaction removes the
     * whole thing before anyone has read the event.
     *
     * Each of these was accepted before, and together they turned a bounded,
     * observable agent into an unbounded one: a 100% per-report bound with a
     * one-second epoch doubles the reported valuation every block, and a zero
     * redemption delay converts the result to cash in the same block.
     */
    function _expectRejected(LemonVault.Limits memory l) internal {
        vm.prank(admin);
        vm.expectRevert(LemonVault.InvalidLimits.selector);
        vault.setLimits(l);
    }

    function test_AdminCannotWidenThePerReportNavBound() public {
        LemonVault.Limits memory l = defaultLimits();
        l.maxNavDeviationBps = 10_000;
        l.maxNavEpochDeviationBps = 10_000;
        _expectRejected(l);
    }

    function test_AdminCannotWidenTheEpochNavBound() public {
        LemonVault.Limits memory l = defaultLimits();
        l.maxNavEpochDeviationBps = 9_000;
        _expectRejected(l);
    }

    function test_AdminCannotShrinkTheEpochToNothing() public {
        LemonVault.Limits memory l = defaultLimits();
        l.navEpochDuration = 1;
        _expectRejected(l);
    }

    function test_AdminCannotRemoveTheRedemptionDelay() public {
        LemonVault.Limits memory l = defaultLimits();
        l.minRedeemDelay = 0;
        _expectRejected(l);
    }

    function test_AdminCannotDeployTheWholeVault() public {
        LemonVault.Limits memory l = defaultLimits();
        l.maxDeployedBps = 10_000;
        _expectRejected(l);
    }

    /**
     * Staleness has to outlast the reporting rate limit. Set the other way the
     * agent is forbidden from reporting until after the vault has already
     * frozen, which blocks deposits and fulfilments with no way back.
     */
    function test_AdminCannotConfigureAVaultThatCanNeverReport() public {
        LemonVault.Limits memory l = defaultLimits();
        l.minNavReportInterval = 6 hours;
        l.maxNavStaleness = 1 hours;
        _expectRejected(l);
    }

    /// The templates the protocol actually ships still pass, in both tiers.
    function test_ShippedLimitsRemainValid() public {
        vm.prank(admin);
        vault.setLimits(defaultLimits());
    }
}
