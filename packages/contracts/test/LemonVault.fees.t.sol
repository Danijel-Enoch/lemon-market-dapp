// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LemonVault} from "../src/LemonVault.sol";
import {VaultTest} from "./VaultTest.sol";

/// @dev 2% a year on assets, 20% of gains above the high-water mark, both to the insurance fund.
contract LemonVaultFeesTest is VaultTest {
    function _onlyManagement() internal pure returns (LemonVault.Limits memory l) {
        l = defaultLimits();
        l.performanceFeeBps = 0;
    }

    function _onlyPerformance() internal pure returns (LemonVault.Limits memory l) {
        l = defaultLimits();
        l.managementFeeBps = 0;
    }

    function _useVault(LemonVault.Limits memory l) internal {
        vault = _deployVault(l);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
    }

    /// Value of an account's shares right now, in USDC.
    function _valueOf(address who) internal view returns (uint256) {
        return vault.convertToAssets(vault.balanceOf(who));
    }

    // -- management fee -----------------------------------------------------

    function test_ManagementFeeIsTwoPercentOfAssetsPerYear() public {
        _useVault(_onlyManagement());
        _deposit(alice, 1_000 * ONE_USDC);

        skip(365 days);
        vault.accrueFees();

        // The fee is minted as shares, so the vault still holds 1,000 USDC —
        // what changed is how much of it is Alice's.
        assertEq(vault.totalAssets(), 1_000 * ONE_USDC);
        assertApproxEqAbs(_valueOf(insurance), 20 * ONE_USDC, 0.02e6, "2% of 1,000");
        assertApproxEqAbs(_valueOf(alice), 980 * ONE_USDC, 0.02e6, "the rest stays Alice's");
    }

    function test_ManagementFeeStreamsProRata() public {
        _useVault(_onlyManagement());
        _deposit(alice, 1_000 * ONE_USDC);

        skip(182.5 days);
        vault.accrueFees();
        assertApproxEqAbs(_valueOf(insurance), 10 * ONE_USDC, 0.02e6, "half a year, half the fee");
    }

    function test_NoManagementFeeWithNoTimeElapsed() public {
        _useVault(_onlyManagement());
        _deposit(alice, 1_000 * ONE_USDC);
        vault.accrueFees();
        assertEq(vault.balanceOf(insurance), 0);
    }

    /// Rent on assets under management, so it is charged on losses too.
    function test_ManagementFeeAccruesEvenWhenThePositionLoses() public {
        _useVault(_onlyManagement());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        skip(365 days);
        _reportNav(810 * ONE_USDC); // down 10%

        assertGt(vault.balanceOf(insurance), 0, "management fee is not contingent on profit");
        assertLt(_valueOf(alice), 1_000 * ONE_USDC);
    }

    // -- performance fee ----------------------------------------------------

    function test_PerformanceFeeIsTwentyPercentOfTheGain() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        _skipAndReport(5 minutes, 990 * ONE_USDC); // +90 on the vault

        // 20% of 90 is 18.
        assertApproxEqAbs(_valueOf(insurance), 18 * ONE_USDC, 0.05e6, "20% of the 90 gain");
        assertApproxEqAbs(_valueOf(alice), 1_072 * ONE_USDC, 0.05e6, "the other 80% is Alice's");
        assertEq(vault.totalAssets(), 1_090 * ONE_USDC);
    }

    function test_NoPerformanceFeeWithoutAGain() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        _skipAndReport(5 minutes, 900 * ONE_USDC);
        assertEq(vault.balanceOf(insurance), 0, "flat is not a gain");

        _skipAndReport(5 minutes, 850 * ONE_USDC);
        assertEq(vault.balanceOf(insurance), 0, "and neither is a loss");
    }

    /**
     * The high-water mark, and the reason it exists. A vault that falls and
     * climbs back to where it started has made its holders nothing, so charging
     * a performance fee on the recovery would bill them twice for one dollar.
     */
    function test_NoPerformanceFeeOnMerelyRecoveringALoss() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        _skipAndReport(5 minutes, 990 * ONE_USDC); // up
        uint256 markAfterGain = vault.highWaterMarkPps();
        uint256 feeSharesAfterGain = vault.balanceOf(insurance);
        assertGt(feeSharesAfterGain, 0);

        _skipAndReport(5 minutes, 900 * ONE_USDC); // back down
        _skipAndReport(5 minutes, 990 * ONE_USDC); // and back up to the same place

        assertEq(
            vault.balanceOf(insurance),
            feeSharesAfterGain,
            "recovering to the old peak must cost the holders nothing"
        );
        assertEq(vault.highWaterMarkPps(), markAfterGain);
    }

    function test_PerformanceFeeResumesAboveTheOldPeak() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        _skipAndReport(5 minutes, 990 * ONE_USDC);
        uint256 afterFirstGain = vault.balanceOf(insurance);

        _skipAndReport(5 minutes, 900 * ONE_USDC);
        _skipAndReport(5 minutes, 990 * ONE_USDC);
        _skipAndReport(5 minutes, 1_080 * ONE_USDC); // a genuinely new high

        assertGt(vault.balanceOf(insurance), afterFirstGain, "new highs are chargeable again");
    }

    /**
     * The mark has to be re-read after the fee shares are minted. Marking the
     * pre-dilution peak would leave the price permanently below a mark it can
     * only reach by earning the same gain twice.
     */
    function test_HighWaterMarkIsRecordedAfterDilution() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 990 * ONE_USDC);

        assertEq(vault.highWaterMarkPps(), vault.pricePerShare(), "mark equals the diluted price");
    }

    // -- interaction --------------------------------------------------------

    /**
     * Management fee first. It is rent on assets, and taking it after the
     * performance fee would pay the operator a share of assets it is about to
     * charge itself as rent.
     */
    function test_ManagementFeeIsChargedBeforeThePerformanceFee() public {
        _useVault(defaultLimits());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);

        skip(365 days);
        _reportNav(990 * ONE_USDC);

        uint256 both = _valueOf(insurance);

        // Same year, same gain, performance fee only.
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);
        skip(365 days);
        _reportNav(990 * ONE_USDC);
        uint256 perfOnly = _valueOf(insurance);

        assertGt(both, perfOnly, "the two fees compose");
        // 2% of 1,000 is 20; the performance fee is then charged on the ~70 that
        // remains above the mark rather than on the full 90.
        assertLt(both, 20 * ONE_USDC + 18 * ONE_USDC, "and do not double-charge the same dollars");
    }

    function test_FeesAreMintedToTheInsuranceFund() public {
        _useVault(defaultLimits());
        _deposit(alice, 1_000 * ONE_USDC);
        skip(365 days);
        vault.accrueFees();

        assertGt(vault.balanceOf(insurance), 0, "the fee is a share position, not a transfer");
        assertEq(usdc.balanceOf(insurance), 0, "no USDC leaves the working position");
    }

    function test_InsuranceFundAddressCanBeMoved() public {
        _useVault(defaultLimits());
        _deposit(alice, 1_000 * ONE_USDC);
        address next = makeAddr("newInsurance");

        skip(365 days);
        vm.prank(admin);
        vault.setInsuranceFund(next);

        // Fees are settled to the old address before the switch, so the change
        // cannot retroactively reassign a year of accrual.
        assertGt(vault.balanceOf(insurance), 0);
        assertEq(vault.balanceOf(next), 0);

        skip(365 days);
        vault.accrueFees();
        assertGt(vault.balanceOf(next), 0);
    }

    function test_EmptyVaultResetsTheMarkRatherThanBillingTheNextDepositor() public {
        _useVault(_onlyPerformance());
        _deposit(alice, 1_000 * ONE_USDC);
        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 990 * ONE_USDC);
        assertGt(vault.highWaterMarkPps(), ONE_USDC);

        // Everyone leaves.
        _agentReturn(990 * ONE_USDC);
        uint256 aliceShares = vault.balanceOf(alice);
        _requestRedeem(alice, aliceShares);
        // Read first: a view call would otherwise spend the prank.
        uint256 feeShares = vault.balanceOf(insurance);
        vm.prank(insurance);
        vault.requestRedeem(feeShares, insurance, insurance);

        skip(3 days);
        _reportNav(0);
        _fulfill(alice, aliceShares);
        _fulfill(insurance, vault.pendingRedeemRequest(0, insurance));

        assertEq(vault.totalSupply(), 0);
        vault.accrueFees();
        assertEq(
            vault.highWaterMarkPps(),
            ONE_USDC,
            "a fresh depositor should not inherit a departed cohort's peak"
        );
    }

    // -- limits -------------------------------------------------------------

    function test_FeesAreCappedByConstruction() public {
        LemonVault.Limits memory l = defaultLimits();
        l.managementFeeBps = 501; // over MAX_MANAGEMENT_FEE_BPS
        vm.expectRevert(LemonVault.InvalidLimits.selector);
        _deployVault(l);

        l = defaultLimits();
        l.performanceFeeBps = 3001; // over MAX_PERFORMANCE_FEE_BPS
        vm.expectRevert(LemonVault.InvalidLimits.selector);
        _deployVault(l);
    }

    /// The operator's take must never exceed the fee schedule, at any duration.
    function testFuzz_ManagementFeeNeverExceedsTheRate(uint32 elapsed, uint96 depositAmount) public {
        uint256 amount = bound(depositAmount, ONE_USDC, 100_000 * ONE_USDC);
        uint256 secs = bound(elapsed, 0, 365 days);

        _useVault(_onlyManagement());
        _deposit(alice, amount);
        skip(secs);
        vault.accrueFees();

        uint256 maxFee = (amount * 200 * secs) / (10_000 * 365 days);
        assertLe(_valueOf(insurance), maxFee + 1, "fee must not exceed 2%/yr pro rata");
    }
}
