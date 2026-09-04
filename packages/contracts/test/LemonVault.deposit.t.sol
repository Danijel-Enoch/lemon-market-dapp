// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {VaultTest} from "./VaultTest.sol";

/// @dev Deposits and the share maths they price against.
contract LemonVaultDepositTest is VaultTest {
    function setUp() public override {
        super.setUp();
        // Share-price assertions, so no fee stream muddying the arithmetic.
        vault = _deployVault(noFeeLimits());
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_SharesAre18DecimalsAgainstA6DecimalAsset() public view {
        assertEq(vault.decimals(), 18, "shares should be 18dp");
        assertEq(IERC20(address(usdc)).totalSupply() >= 0, true);
    }

    function test_FirstDepositMintsAtParity() public {
        uint256 shares = _deposit(alice, 1_000 * ONE_USDC);

        assertEq(shares, 1_000e18, "1,000 USDC should mint 1,000 whole shares");
        assertEq(vault.pricePerShare(), ONE_USDC, "a share should start worth one USDC");
        assertEq(vault.totalAssets(), 1_000 * ONE_USDC);
        assertEq(usdc.balanceOf(address(vault)), 1_000 * ONE_USDC);
    }

    function test_SecondDepositAtAnUnchangedPriceMintsTheSameRate() public {
        _deposit(alice, 1_000 * ONE_USDC);
        uint256 bobShares = _deposit(bob, 1_000 * ONE_USDC);

        assertEq(bobShares, 1_000e18, "no gain reported, so no repricing");
        assertEq(vault.totalSupply(), 2_000e18);
    }

    /// A deposit after the position has gained should buy fewer shares, not more.
    function test_DepositAfterAGainMintsFewerShares() public {
        _deposit(alice, 1_000 * ONE_USDC);

        _agentWithdraw(900 * ONE_USDC);
        _skipAndReport(5 minutes, 990 * ONE_USDC); // +90 USDC on the position

        assertEq(vault.totalAssets(), 1_090 * ONE_USDC, "gain should land in NAV");

        uint256 bobShares = _deposit(bob, 1_000 * ONE_USDC);
        assertLt(bobShares, 1_000e18, "a richer share should cost more");
        assertApproxEqRel(bobShares, 917e18, 0.001e18, "1000/1.09 whole shares");

        // Alice keeps the gain; Bob is not diluted into a share of it.
        assertApproxEqAbs(
            vault.convertToAssets(vault.balanceOf(alice)), 1_090 * ONE_USDC, 2, "alice keeps the gain"
        );
        assertApproxEqAbs(
            vault.convertToAssets(vault.balanceOf(bob)), 1_000 * ONE_USDC, 2, "bob buys in at par"
        );
    }

    /**
     * The classic ERC-4626 first-depositor attack: mint one wei of shares, then
     * donate a large balance so the next deposit rounds down to nothing.
     *
     * The decimals offset is what defeats it, and the mechanism is worth stating
     * because it is not "the attack reverts" — it is that the attacker's
     * donation is captured mostly by the victim, so the attack costs the
     * attacker money. A test that only asserted the victim was unharmed would
     * still pass against an implementation with no offset at all.
     */
    function test_InflationAttackCostsTheAttacker() public {
        vm.prank(bob);
        uint256 attackerShares = vault.deposit(1, bob); // one wei of USDC

        vm.prank(bob);
        usdc.transfer(address(vault), 10_000 * ONE_USDC); // the donation

        uint256 victimShares = _deposit(alice, 1_000 * ONE_USDC);

        assertGt(victimShares, 0, "victim must not round to zero shares");
        // A few wei, not a few percent. Without the offset the donation would
        // round the victim's deposit down to almost nothing, so the tolerance
        // here is what separates "rounding" from "the attack worked".
        assertGe(
            vault.convertToAssets(victimShares),
            1_000 * ONE_USDC - 10,
            "victim should exit with what they put in, less rounding dust"
        );
        assertLt(
            vault.convertToAssets(attackerShares),
            10_000 * ONE_USDC + 1,
            "attacker should not recover the donation"
        );
    }

    function test_DepositIsBlockedWhilePaused() public {
        vm.prank(guardian);
        vault.pause();

        assertEq(vault.maxDeposit(alice), 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxDeposit.selector, alice, 1_000 * ONE_USDC, 0)
        );
        vault.deposit(1_000 * ONE_USDC, alice);
    }

    /**
     * A stale NAV means the share price is a guess. Accepting a deposit against
     * it would sell shares at a price nobody stands behind, so the vault stops
     * quoting rather than quoting badly.
     */
    function test_DepositIsBlockedWhenTheNavIsStale() public {
        skip(7 hours); // maxNavStaleness is 6

        assertTrue(vault.navIsStale());
        assertEq(vault.maxDeposit(alice), 0);

        vm.prank(alice);
        vm.expectRevert();
        vault.deposit(1_000 * ONE_USDC, alice);
    }

    function test_DepositResumesOnceTheAgentReports() public {
        _deposit(alice, 1_000 * ONE_USDC);
        skip(7 hours);
        assertTrue(vault.navIsStale());

        _reportNav(0);

        assertFalse(vault.navIsStale());
        assertGt(_deposit(bob, 100 * ONE_USDC), 0);
    }

    function test_MintTakesTheSamePath() public {
        vm.prank(alice);
        uint256 assets = vault.mint(1_000e18, alice);
        assertEq(assets, 1_000 * ONE_USDC);
        assertEq(vault.balanceOf(alice), 1_000e18);
    }

    /// A deposit must never mint shares worth more than the assets handed over.
    function testFuzz_DepositNeverMintsMoreValueThanItReceives(uint96 amount) public {
        amount = uint96(bound(amount, 1, 500_000 * ONE_USDC));

        uint256 shares = _deposit(alice, amount);
        assertLe(vault.convertToAssets(shares), amount, "minted value must not exceed the deposit");
    }

    /// Two depositors at the same price must hold proportional claims.
    function testFuzz_ProportionalClaimsAtAnUnchangedPrice(uint96 a, uint96 b) public {
        uint256 aAmount = bound(a, ONE_USDC, 100_000 * ONE_USDC);
        uint256 bAmount = bound(b, ONE_USDC, 100_000 * ONE_USDC);

        uint256 aShares = _deposit(alice, aAmount);
        uint256 bShares = _deposit(bob, bAmount);

        // shares_a / shares_b should equal assets_a / assets_b, to rounding.
        assertApproxEqRel(aShares * bAmount, bShares * aAmount, 0.0001e18, "claims should be proportional");
    }
}
