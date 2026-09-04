// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LemonVault} from "../src/LemonVault.sol";
import {VaultTest} from "./VaultTest.sol";

/// @dev The ERC-7540 request/fulfil/claim lifecycle — the 3-7 day withdrawal.
contract LemonVaultRedeemTest is VaultTest {
    address internal attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();
        vault = _deployVault(noFeeLimits());
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
        _deposit(alice, 1_000 * ONE_USDC);
    }

    // -- requesting ---------------------------------------------------------

    /**
     * Escrow, not burn. The requester keeps full exposure to the position until
     * the agent actually unwinds it, because pricing the exit on request day
     * would hand them a free option on everyone else's capital while the agent
     * spends days closing a leveraged hedge.
     */
    function test_RequestEscrowsSharesWithoutBurningThem() public {
        _requestRedeem(alice, 400e18);

        assertEq(vault.balanceOf(alice), 600e18, "shares leave the holder");
        assertEq(vault.balanceOf(address(vault)), 400e18, "and sit in escrow");
        assertEq(vault.totalSupply(), 1_000e18, "but are still outstanding");
        assertEq(vault.pendingRedeemRequest(0, alice), 400e18);
        assertEq(vault.totalPendingRedeemShares(), 400e18);
        assertEq(vault.pricePerShare(), ONE_USDC, "queueing must not move the price");
    }

    function test_RequestSurfacesItsOwnDeadlines() public {
        uint256 at = block.timestamp;
        _requestRedeem(alice, 400e18);

        (,,, uint64 requestedAt, uint64 eligibleAt, uint64 fulfillBy) = vault.redeemStateOf(alice);
        assertEq(requestedAt, at);
        assertEq(eligibleAt, at + 3 days, "the agent may not act before this");
        assertEq(fulfillBy, at + 7 days, "and is held to this");
    }

    function test_RequestingIsAllowedEvenWhilePaused() public {
        vm.prank(guardian);
        vault.pause();

        // A pause protects the vault from the agent, not the users from the exit.
        _requestRedeem(alice, 100e18);
        assertEq(vault.pendingRedeemRequest(0, alice), 100e18);
    }

    /**
     * Requests merge under one id, so the delay has to restart on a top-up.
     * Keeping the earliest timestamp instead would let a one-wei request ripen
     * for three days and then carry an arbitrarily large addition out with it.
     */
    function test_ToppingUpAPendingRequestRestartsTheDelay() public {
        _requestRedeem(alice, 100e18);
        skip(2 days);
        _requestRedeem(alice, 100e18);

        (,,,, uint64 eligibleAt,) = vault.redeemStateOf(alice);
        assertEq(eligibleAt, block.timestamp + 3 days);

        skip(2 days); // four days after the first request, one after the second
        _reportNav(0);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.RedeemDelayNotElapsed.selector, eligibleAt));
        vault.fulfillRedeem(alice, 200e18);
    }

    /// A stranger must not be able to restart someone else's clock with dust.
    function test_AStrangerCannotWriteIntoAnothersQueue() public {
        _deposit(bob, 100 * ONE_USDC);
        vm.prank(bob);
        vault.transfer(attacker, 1);

        vm.prank(attacker);
        vm.expectRevert(LemonVault.NotAuthorized.selector);
        vault.requestRedeem(1, alice, attacker);
    }

    function test_CannotRequestSomeoneElsesShares() public {
        vm.prank(attacker);
        vm.expectRevert(LemonVault.NotAuthorized.selector);
        vault.requestRedeem(100e18, attacker, alice);
    }

    // -- fulfilling ---------------------------------------------------------

    function test_FulfilIsRefusedBeforeTheDelayElapses() public {
        uint256 eligibleAt = block.timestamp + 3 days;
        _requestRedeem(alice, 400e18);

        skip(3 days - 1);
        _reportNav(0);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.RedeemDelayNotElapsed.selector, eligibleAt));
        vault.fulfillRedeem(alice, 400e18);
    }

    function test_FulfilBurnsTheEscrowAndSetsAssetsAside() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);

        uint256 assets = _fulfill(alice, 400e18);

        assertEq(assets, 400 * ONE_USDC);
        assertEq(vault.totalSupply(), 600e18, "escrowed shares are burned at fulfilment");
        assertEq(vault.balanceOf(address(vault)), 0);
        assertEq(vault.claimableAssets(), 400 * ONE_USDC);
        assertEq(vault.totalAssets(), 600 * ONE_USDC, "set-aside assets leave the share price");
        assertEq(vault.pricePerShare(), ONE_USDC, "remaining holders are unaffected");
        assertEq(vault.maxRedeem(alice), 400e18);
        assertEq(vault.maxWithdraw(alice), 400 * ONE_USDC);
        assertEq(vault.pendingRedeemRequest(0, alice), 0);
    }

    function test_FulfilCanBePartial() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);

        _fulfill(alice, 150e18);
        assertEq(vault.pendingRedeemRequest(0, alice), 250e18);
        assertEq(vault.claimableRedeemRequest(0, alice), 150e18);

        _fulfill(alice, 250e18);
        assertEq(vault.pendingRedeemRequest(0, alice), 0);
        assertEq(vault.claimableRedeemRequest(0, alice), 400e18);
    }

    function test_FulfilCannotExceedThePendingRequest() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.ExceedsPendingRequest.selector, 401e18, 400e18));
        vault.fulfillRedeem(alice, 401e18);
    }

    /// The agent has to have actually unwound. Fulfilment cannot conjure liquidity.
    function test_FulfilRequiresTheAssetsToBePresent() public {
        _agentWithdraw(900 * ONE_USDC);
        _requestRedeem(alice, 500e18);
        skip(3 days);
        _reportNav(900 * ONE_USDC);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(LemonVault.InsufficientFreeAssets.selector, 500 * ONE_USDC, 100 * ONE_USDC)
        );
        vault.fulfillRedeem(alice, 500e18);

        _agentReturn(500 * ONE_USDC);
        assertEq(_fulfill(alice, 500e18), 500 * ONE_USDC);
    }

    /**
     * The economic heart of the delay: a position that loses value while it is
     * being unwound costs the person who asked to leave, not the people who
     * stayed. Anything else pays exiters out of the remaining holders' capital.
     */
    function test_TheRequesterCarriesLossesIncurredDuringTheUnwind() public {
        _agentWithdraw(900 * ONE_USDC);
        _requestRedeem(alice, 500e18);

        skip(3 days);
        _reportNav(810 * ONE_USDC); // the position lost 10%
        assertEq(vault.totalAssets(), 910 * ONE_USDC);

        _agentReturn(500 * ONE_USDC);
        uint256 assets = _fulfill(alice, 500e18);

        assertEq(assets, 455 * ONE_USDC, "half the vault, at the price after the loss");
        assertEq(
            vault.convertToAssets(vault.balanceOf(alice)),
            455 * ONE_USDC,
            "the loss is split evenly, not shifted onto stayers"
        );
    }

    function test_FulfilIsRefusedAgainstAStaleNav() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);

        vm.prank(agent);
        vm.expectRevert(LemonVault.NavStale.selector);
        vault.fulfillRedeem(alice, 400e18);
    }

    /**
     * The one exception. If the agent is gone the NAV goes stale and stays
     * stale, and a rule that refuses to price an exit against a stale NAV would
     * trap every depositor permanently. A guardian working a declared emergency
     * exit can price against the last known number — worse than fresh, far
     * better than never.
     */
    function test_GuardianCanFulfilAgainstAStaleNavDuringAnEmergencyExit() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        assertTrue(vault.navIsStale());

        vm.prank(guardian);
        vm.expectRevert(LemonVault.NavStale.selector);
        vault.fulfillRedeem(alice, 400e18);

        vm.prank(guardian);
        vault.setEmergencyExit(true);

        vm.prank(guardian);
        uint256 assets = vault.fulfillRedeem(alice, 400e18);
        assertEq(assets, 400 * ONE_USDC);
    }

    function test_FulfilIsRefusedToStrangers() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);

        vm.prank(attacker);
        vm.expectRevert(LemonVault.NotAuthorized.selector);
        vault.fulfillRedeem(alice, 400e18);
    }

    // -- claiming -----------------------------------------------------------

    function test_ClaimPaysOutAndClearsTheRequest() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = vault.redeem(400e18, alice, alice);

        assertEq(assets, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(alice) - before, 400 * ONE_USDC);
        assertEq(vault.claimableAssets(), 0);
        assertEq(vault.maxRedeem(alice), 0);
    }

    function test_ClaimCanGoToADifferentReceiver() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);

        vm.prank(alice);
        vault.redeem(400e18, bob, alice);
        assertEq(usdc.balanceOf(bob), 1_000_400 * ONE_USDC);
    }

    function test_ClaimByAssetAmount() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);

        vm.prank(alice);
        uint256 shares = vault.withdraw(100 * ONE_USDC, alice, alice);

        assertEq(shares, 100e18);
        assertEq(vault.maxWithdraw(alice), 300 * ONE_USDC);
    }

    function test_ClaimCannotExceedWhatWasFulfilled() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 200e18);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LemonVault.ExceedsClaimableRequest.selector, 300e18, 200e18));
        vault.redeem(300e18, alice, alice);
    }

    function test_ClaimIsRefusedToStrangers() public {
        _requestRedeem(alice, 400e18);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);

        vm.prank(attacker);
        vm.expectRevert(LemonVault.NotAuthorized.selector);
        vault.redeem(400e18, attacker, alice);
    }

    // -- operators ----------------------------------------------------------

    function test_AnOperatorCanRequestAndClaimOnBehalf() public {
        vm.prank(alice);
        vault.setOperator(bob, true);

        vm.prank(bob);
        vault.requestRedeem(400e18, alice, alice);
        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);

        vm.prank(bob);
        vault.redeem(400e18, alice, alice);

        // Alice put 1,000 in and has taken 400 back out; the operator acted
        // throughout but never touched the money.
        assertEq(usdc.balanceOf(alice), 999_400 * ONE_USDC);
        assertEq(usdc.balanceOf(bob), 1_000_000 * ONE_USDC, "the operator is not a recipient");
        assertEq(vault.balanceOf(alice), 600e18);
    }

    function test_OperatorAuthorityCanBeRevoked() public {
        vm.prank(alice);
        vault.setOperator(bob, true);
        vm.prank(alice);
        vault.setOperator(bob, false);

        vm.prank(bob);
        vm.expectRevert(LemonVault.NotAuthorized.selector);
        vault.requestRedeem(400e18, alice, alice);
    }

    // -- ERC-7540 conformance ----------------------------------------------

    /**
     * A preview implies a price available now. This vault's exit price is fixed
     * days later at fulfilment, so returning today's number would be quoting
     * something it has no intention of honouring. ERC-7540 requires the revert.
     */
    function test_SynchronousPreviewsRevert() public {
        vm.expectRevert(LemonVault.AsyncRedemptionOnly.selector);
        vault.previewRedeem(1e18);

        vm.expectRevert(LemonVault.AsyncRedemptionOnly.selector);
        vault.previewWithdraw(ONE_USDC);
    }

    function test_MaxRedeemIsClaimableNotHeld() public {
        assertEq(vault.balanceOf(alice), 1_000e18);
        assertEq(vault.maxRedeem(alice), 0, "held shares are not withdrawable until fulfilled");

        _requestRedeem(alice, 400e18);
        assertEq(vault.maxRedeem(alice), 0, "nor while pending");

        skip(3 days);
        _reportNav(0);
        _fulfill(alice, 400e18);
        assertEq(vault.maxRedeem(alice), 400e18, "only once fulfilled");
    }

    function test_AdvertisesTheAsyncRedeemInterface() public view {
        assertTrue(vault.supportsInterface(0x620ee8e4), "ERC-7540 async redeem");
    }

    // -- properties ---------------------------------------------------------

    /// Whatever the split, a full round trip must return the deposit less dust.
    function testFuzz_RequestFulfilClaimReturnsTheDeposit(uint96 depositAmount, uint96 part) public {
        uint256 amount = bound(depositAmount, ONE_USDC, 100_000 * ONE_USDC);
        vault = _deployVault(noFeeLimits());
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);

        uint256 shares = _deposit(bob, amount);
        uint256 firstPart = bound(part, 1, shares);

        vm.prank(bob);
        vault.requestRedeem(shares, bob, bob);
        skip(3 days);
        _reportNav(0);

        uint256 before = usdc.balanceOf(bob);
        _fulfill(bob, firstPart);
        vm.prank(bob);
        vault.redeem(firstPart, bob, bob);

        if (firstPart < shares) {
            _fulfill(bob, shares - firstPart);
            vm.prank(bob);
            vault.redeem(shares - firstPart, bob, bob);
        }

        assertApproxEqAbs(usdc.balanceOf(bob) - before, amount, 3, "a round trip should be value-neutral");
    }
}
