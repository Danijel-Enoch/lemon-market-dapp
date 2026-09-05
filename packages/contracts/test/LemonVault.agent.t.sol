// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {VaultTest} from "./VaultTest.sol";

/**
 * @dev Everything the agent key can do, and everything it cannot.
 *
 * These are the tests that decide how bad a stolen agent key is. Each one is
 * written from the attacker's side: assume the key is compromised, then check
 * the limit actually holds.
 */
contract LemonVaultAgentTest is VaultTest {
    address internal attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();
        vault = _deployVault(noFeeLimits());
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
        _deposit(alice, 1_000 * ONE_USDC);
    }

    // -- capital movement ---------------------------------------------------

    /**
     * The window cap has to hold *across* its own boundary.
     *
     * A counter that resets wholesale at a fixed boundary lets the agent draw
     * the full cap in the last second of one window and the full cap again in
     * the first second of the next — twice the stated limit inside two seconds,
     * which is the exact burst the cap exists to prevent. The allowance refills
     * in proportion to elapsed time instead, so one second buys back one
     * second's worth.
     */
    function test_WindowCapHoldsAcrossItsOwnBoundary() public {
        LemonVault.Limits memory l = noFeeLimits();
        l.agentWithdrawWindowCap = 100 * ONE_USDC;
        l.agentWithdrawWindow = 1 hours;
        vm.prank(admin);
        vault.setLimits(l);

        // Sit until one second before a tumbling window would have rolled.
        skip(1 hours - 1);
        _agentWithdraw(100 * ONE_USDC);
        skip(1);

        vm.prank(agent);
        vm.expectRevert();
        vault.agentWithdraw(100 * ONE_USDC);

        assertEq(vault.deployedAssets(), 100 * ONE_USDC, "one cap's worth, not two");
    }

    /// A full window's wait does refill it — the bucket leaks, it does not seize.
    function test_WindowCapRefillsOverAFullWindow() public {
        LemonVault.Limits memory l = noFeeLimits();
        l.agentWithdrawWindowCap = 100 * ONE_USDC;
        l.agentWithdrawWindow = 1 hours;
        vm.prank(admin);
        vault.setLimits(l);

        _agentWithdraw(100 * ONE_USDC);
        skip(1 hours);
        _reportNav(100 * ONE_USDC); // keep the NAV fresh across the wait
        _agentWithdraw(100 * ONE_USDC);

        assertEq(vault.deployedAssets(), 200 * ONE_USDC, "the allowance comes back");
    }

    /**
     * A donation is capital arriving, not capital coming home.
     *
     * `agentReturn` credits USDC the agent already held, so it lowers
     * `deployedAssets` one-for-one and leaves the share price flat. `donate`
     * must not: the money was never deployed, and writing the live position
     * down by the size of the gift would leave the vault understating what it
     * holds and booking the gap back as a fabricated gain later.
     */
    function test_DonateRaisesThePriceAndLeavesThePositionAlone() public {
        _agentWithdraw(500 * ONE_USDC);
        uint256 ppsBefore = vault.pricePerShare();

        usdc.mint(bob, 100 * ONE_USDC);
        vm.startPrank(bob);
        usdc.approve(address(vault), 100 * ONE_USDC);
        vault.donate(100 * ONE_USDC);
        vm.stopPrank();

        assertGt(vault.pricePerShare(), ppsBefore, "holders are better off");
        assertEq(vault.totalAssets(), 1_100 * ONE_USDC, "the whole gift lands in the vault");
        assertEq(vault.deployedAssets(), 500 * ONE_USDC, "the live position is untouched");
    }

    function test_DonateRejectsZero() public {
        vm.prank(bob);
        vm.expectRevert(LemonVault.ZeroAmount.selector);
        vault.donate(0);
    }

    function test_AgentWithdrawMovesCapitalWithoutMovingThePrice() public {
        uint256 ppsBefore = vault.pricePerShare();

        _agentWithdraw(500 * ONE_USDC);

        assertEq(usdc.balanceOf(agent), 1_000_500 * ONE_USDC, "agent receives the USDC");
        assertEq(vault.deployedAssets(), 500 * ONE_USDC);
        assertEq(vault.totalAssets(), 1_000 * ONE_USDC, "value is unchanged, only its location");
        assertEq(vault.pricePerShare(), ppsBefore, "deploying is not a gain");
    }

    /// The single most important limit: the agent cannot name a recipient.
    function test_AgentCannotRedirectFundsAnywhereButItsOwnWallet() public {
        // There is no parameter to abuse — `agentWithdraw` takes an amount only,
        // and the destination is immutable. Assert the address is what the
        // factory set and that it survives a role change.
        assertEq(vault.agentWallet(), agent);

        bytes32 agentRole = vault.AGENT_ROLE();
        vm.prank(admin);
        vault.grantRole(agentRole, attacker);

        vm.prank(attacker);
        vault.agentWithdraw(100 * ONE_USDC);

        assertEq(usdc.balanceOf(attacker), 0, "a second agent key still cannot receive funds");
        assertEq(usdc.balanceOf(agent), 1_000_100 * ONE_USDC);
    }

    function test_AgentWithdrawIsRefusedToNonAgents() public {
        // Read the role first: `vm.prank` applies to the next call, and a view
        // call inside the expectation would quietly spend it.
        bytes32 agentRole = vault.AGENT_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, agentRole
            )
        );
        vm.prank(attacker);
        vault.agentWithdraw(1);
    }

    /// An idle buffer has to survive, or a ripe redemption stalls on an unwind.
    function test_AgentCannotDeployPastTheCeiling() public {
        uint256 ceiling = 900 * ONE_USDC; // 90% of 1,000

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(LemonVault.DeployedCeilingExceeded.selector, 901 * ONE_USDC, ceiling)
        );
        vault.agentWithdraw(901 * ONE_USDC);

        _agentWithdraw(ceiling);
        assertEq(vault.freeAssets(), 100 * ONE_USDC, "the buffer stays behind");
    }

    function test_AgentWithdrawIsRateLimitedPerWindow() public {
        LemonVault.Limits memory limits = noFeeLimits();
        limits.agentWithdrawWindowCap = 300 * ONE_USDC;
        limits.agentWithdrawWindow = 1 days;
        vault = _deployVault(limits);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        _deposit(alice, 1_000 * ONE_USDC);

        _agentWithdraw(300 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.AgentWindowCapExceeded.selector, 1 * ONE_USDC, 0));
        vault.agentWithdraw(1 * ONE_USDC);

        // The window rolls, and the cap refills — it is a rate limit, not a quota.
        skip(1 days);
        _reportNav(300 * ONE_USDC);
        _agentWithdraw(300 * ONE_USDC);
        assertEq(vault.deployedAssets(), 600 * ONE_USDC);
    }

    function test_AgentCannotWithdrawWhilePausedOrStaleOrExiting() public {
        vm.prank(guardian);
        vault.pause();
        vm.prank(agent);
        vm.expectRevert();
        vault.agentWithdraw(1 * ONE_USDC);
        vm.prank(admin);
        vault.unpause();

        skip(7 hours);
        vm.prank(agent);
        vm.expectRevert(LemonVault.NavStale.selector);
        vault.agentWithdraw(1 * ONE_USDC);
        _reportNav(0);

        vm.prank(guardian);
        vault.setEmergencyExit(true);
        vm.prank(agent);
        vm.expectRevert(LemonVault.AgentWithdrawalsDisabled.selector);
        vault.agentWithdraw(1 * ONE_USDC);
    }

    function test_AgentCannotWithdrawAssetsOwedToAFulfilledRedemption() public {
        _requestRedeem(alice, 500e18);
        skip(3 days);
        _reportNav(0);
        uint256 owed = _fulfill(alice, 500e18);
        assertEq(owed, 500 * ONE_USDC);

        // 1,000 USDC is in the contract but half of it belongs to Alice.
        assertEq(usdc.balanceOf(address(vault)), 1_000 * ONE_USDC);
        assertEq(vault.freeAssets(), 500 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(LemonVault.InsufficientFreeAssets.selector, 501 * ONE_USDC, 500 * ONE_USDC)
        );
        vault.agentWithdraw(501 * ONE_USDC);
    }

    function test_AnyoneCanReturnCapital() public {
        _agentWithdraw(500 * ONE_USDC);

        // A revoked agent must still be able to hand the money back.
        bytes32 agentRole = vault.AGENT_ROLE();
        vm.prank(admin);
        vault.revokeRole(agentRole, agent);

        _agentReturn(500 * ONE_USDC);
        assertEq(vault.deployedAssets(), 0);
        assertEq(vault.totalAssets(), 1_000 * ONE_USDC);
    }

    function test_ReturningMoreThanWasDeployedIsAProfit() public {
        _agentWithdraw(500 * ONE_USDC);
        _agentReturn(600 * ONE_USDC); // unwound at a gain

        assertEq(vault.deployedAssets(), 0, "nothing left outside");
        assertEq(vault.totalAssets(), 1_100 * ONE_USDC, "the gain is real assets, not a claim");
        assertEq(vault.navEpochAnchor(), 0);
    }

    // -- NAV reporting ------------------------------------------------------

    function test_NavReportRepricesShares() public {
        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 945 * ONE_USDC); // +5% on the position

        assertEq(vault.totalAssets(), 1_045 * ONE_USDC);
        assertApproxEqAbs(vault.pricePerShare(), 1_045_000, 10, "+4.5% on the vault");
    }

    function test_NavReportIsBoundedPerReport() public {
        _agentWithdraw(900 * ONE_USDC);
        skip(5 minutes);

        // 10% of 900 is 90, so 991 is one USDC too far.
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(LemonVault.NavDeviationTooLarge.selector, 91 * ONE_USDC, 90 * ONE_USDC)
        );
        vault.reportNav(991 * ONE_USDC, 10_000, uint64(block.timestamp));

        _reportNav(990 * ONE_USDC); // exactly at the bound is allowed
        assertEq(vault.deployedAssets(), 990 * ONE_USDC);
    }

    /**
     * The per-report bound alone is not enough: an attacker with the key could
     * spend 10% every interval and reprice the vault over an afternoon. The
     * epoch bound is what makes that fail.
     */
    function test_NavReportIsBoundedAcrossAnEpoch() public {
        _agentWithdraw(900 * ONE_USDC);
        assertEq(vault.navEpochAnchor(), 900 * ONE_USDC);

        uint256 deployed = 900 * ONE_USDC;
        // 50% of the 900 anchor is 450, so 1,350 is the epoch ceiling.
        for (uint256 i = 0; i < 12; i++) {
            skip(5 minutes);
            uint256 next = deployed + (deployed / 10); // +10%, inside the per-report bound
            if (next > 1_350 * ONE_USDC) {
                vm.prank(agent);
                vm.expectRevert();
                vault.reportNav(next, 10_000, uint64(block.timestamp));
                return;
            }
            _reportNav(next);
            deployed = next;
        }
        revert("the epoch bound should have stopped the drip");
    }

    function test_NavEpochBoundRefreshesWithTheEpoch() public {
        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 990 * ONE_USDC);

        skip(1 days); // a new epoch anchors on 990
        _reportNav(1_089 * ONE_USDC);
        assertEq(vault.navEpochAnchor(), 990 * ONE_USDC);
    }

    function test_NavReportsAreRateLimited() public {
        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 910 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(LemonVault.NavReportTooSoon.selector);
        vault.reportNav(920 * ONE_USDC, 10_000, uint64(block.timestamp));
    }

    /**
     * Every percentage of zero is zero, so a percentage bound cannot constrain a
     * vault that has deployed nothing. Without this guard the very first report
     * on a fresh vault could mint the agent an arbitrary NAV.
     */
    function test_NavCannotBeConjuredWithNothingDeployed() public {
        skip(5 minutes);
        vm.prank(agent);
        vm.expectRevert(LemonVault.CannotReportNavWithNothingDeployed.selector);
        vault.reportNav(1_000_000 * ONE_USDC, 10_000, uint64(block.timestamp));

        _reportNav(0); // reporting the truth is fine
    }

    function test_NavReportIsRefusedToNonAgents() public {
        skip(5 minutes);
        vm.prank(attacker);
        vm.expectRevert();
        vault.reportNav(0, 10_000, uint64(block.timestamp));
    }

    /// Capital deployed mid-epoch must not read as an implausible gain.
    function test_DeployingTwiceInOneEpochDoesNotTripTheEpochBound() public {
        _agentWithdraw(400 * ONE_USDC);
        _skipAndReport(5 minutes, 400 * ONE_USDC);

        _agentWithdraw(400 * ONE_USDC);
        assertEq(vault.navEpochAnchor(), 800 * ONE_USDC, "the anchor follows the capital");

        _skipAndReport(5 minutes, 800 * ONE_USDC);
        assertEq(vault.deployedAssets(), 800 * ONE_USDC);
    }

    // -- activity reporting -------------------------------------------------

    function _activity(LemonVault.ActivityKind kind, LemonVault.Chain chain, bytes memory txRef)
        internal
        view
        returns (LemonVault.ActivityReport memory)
    {
        return LemonVault.ActivityReport({
            kind: kind,
            chain: chain,
            symbol: bytes32("NVDA"),
            baseAmount: 5e18,
            notionalAssets: 100 * ONE_USDC,
            pnlAssets: 0,
            feeAssets: ONE_USDC,
            txRef: txRef,
            occurredAt: uint64(block.timestamp)
        });
    }

    function test_ActivityReportsAreAuditOnly() public {
        uint256 assetsBefore = vault.totalAssets();

        vm.prank(agent);
        vault.reportActivity(
            _activity(LemonVault.ActivityKind.SPOT_BUY, LemonVault.Chain.BASE, hex"deadbeef")
        );

        assertEq(vault.activityCount(), 1);
        assertEq(vault.cumulativeNotional(), 100 * ONE_USDC);
        assertEq(vault.cumulativeVenueFees(), ONE_USDC);
        assertEq(vault.totalAssets(), assetsBefore, "reporting activity must move no value");
    }

    /**
     * A Solana signature is 64 bytes. A `bytes32` reference would have to
     * truncate it, and a truncated signature links to nothing — which would make
     * the perp half of the feed exactly the half nobody can check.
     */
    function test_ActivityCanCarryASolanaSignature() public {
        bytes memory solanaSig = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            solanaSig[i] = bytes1(uint8(i + 1));
        }

        vm.prank(agent);
        vault.reportActivity(_activity(LemonVault.ActivityKind.PERP_OPEN, LemonVault.Chain.SOLANA, solanaSig));
        assertEq(vault.activityCount(), 1);
    }

    /// A deployment is several actions describing one decision; they belong in one block.
    function test_ActivityCanBeBatched() public {
        LemonVault.ActivityReport[] memory reports = new LemonVault.ActivityReport[](4);
        reports[0] = _activity(LemonVault.ActivityKind.SPOT_BUY, LemonVault.Chain.BASE, hex"01");
        reports[1] = _activity(LemonVault.ActivityKind.BRIDGE_OUT, LemonVault.Chain.BASE, hex"02");
        reports[2] = _activity(LemonVault.ActivityKind.VENUE_DEPOSIT, LemonVault.Chain.SOLANA, hex"03");
        reports[3] = _activity(LemonVault.ActivityKind.PERP_OPEN, LemonVault.Chain.SOLANA, hex"04");

        vm.prank(agent);
        vault.reportActivityBatch(reports);

        assertEq(vault.activityCount(), 4, "one decision, four legible rows");
        assertEq(vault.cumulativeNotional(), 400 * ONE_USDC);
    }

    function test_ActivityCarriesSignedPnl() public {
        LemonVault.ActivityReport memory r =
            _activity(LemonVault.ActivityKind.FUNDING_SETTLED, LemonVault.Chain.SOLANA, hex"05");
        r.pnlAssets = -12 * int256(ONE_USDC); // funding flipped against the short

        vm.prank(agent);
        vault.reportActivity(r);
        assertEq(vault.activityCount(), 1);
    }

    function test_ActivityReportIsRefusedToNonAgents() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.reportActivity(_activity(LemonVault.ActivityKind.PERP_CLOSE, LemonVault.Chain.SOLANA, hex"00"));
    }

    /**
     * The whole point, as one property: with the key, over one epoch, how much
     * of the vault can an attacker move? Capital only to the agent wallet, and
     * NAV only within the epoch bound.
     */
    function testFuzz_CompromisedAgentCannotExceedItsBounds(uint96 reported) public {
        _agentWithdraw(900 * ONE_USDC);
        uint256 anchor = vault.navEpochAnchor();
        uint256 ceiling = anchor + (anchor * 5000) / 10_000;
        uint256 floor_ = anchor - (anchor * 5000) / 10_000;

        uint256 target = bound(reported, 0, 10_000 * ONE_USDC);
        skip(5 minutes);

        vm.prank(agent);
        try vault.reportNav(target, 10_000, uint64(block.timestamp)) {
            assertLe(target, ceiling, "an accepted report must sit under the epoch ceiling");
            assertGe(target, floor_, "an accepted report must sit above the epoch floor");
        } catch {
            // Rejected. Nothing to assert beyond the state being untouched.
            assertEq(vault.deployedAssets(), 900 * ONE_USDC);
        }
    }
}
