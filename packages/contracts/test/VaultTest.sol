// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixture: a funded vault, named actors, and the helpers every suite repeats.
abstract contract VaultTest is Test {
    MockUSDC internal usdc;
    LemonVault internal vault;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent");
    address internal guardian = makeAddr("guardian");
    address internal insurance = makeAddr("insurance");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant ONE_USDC = 1e6;
    bytes32 internal constant MARKET_ID = keccak256("NVDA");

    /// @dev The unlevered tier: exactly 1x, no headroom, no liquidation price.
    function conservativeRisk() internal pure returns (LemonVault.RiskProfile memory) {
        return LemonVault.RiskProfile({
            tier: LemonVault.RiskTier.CONSERVATIVE, targetLeverageBps: 10_000, maxLeverageBps: 10_000
        });
    }

    /// @dev The levered tier: 2x target with headroom to 3x before the mandate breaks.
    function leveragedRisk() internal pure returns (LemonVault.RiskProfile memory) {
        return LemonVault.RiskProfile({
            tier: LemonVault.RiskTier.LEVERAGED, targetLeverageBps: 20_000, maxLeverageBps: 30_000
        });
    }

    function defaultLimits() internal pure returns (LemonVault.Limits memory) {
        return LemonVault.Limits({
            managementFeeBps: 200, // 2%/yr
            performanceFeeBps: 2000, // 20% over high-water mark
            minRedeemDelay: 3 days,
            maxRedeemDelay: 7 days,
            maxDeployedBps: 9000, // keep 10% idle
            maxNavDeviationBps: 1000, // 10% per report
            maxNavEpochDeviationBps: 5000, // 50% per day
            navEpochDuration: 1 days,
            minNavReportInterval: 5 minutes,
            maxNavStaleness: 6 hours,
            agentWithdrawWindowCap: 10_000_000 * ONE_USDC,
            agentWithdrawWindow: 1 days
        });
    }

    /**
     * @dev The same vault with both fees at zero.
     *
     * Share-maths assertions want exact numbers, and a management fee that
     * streams per second turns every `skip()` into an off-by-a-few-wei mismatch
     * that says nothing about the property under test. Fees get their own suite.
     */
    function noFeeLimits() internal pure returns (LemonVault.Limits memory limits) {
        limits = defaultLimits();
        limits.managementFeeBps = 0;
        limits.performanceFeeBps = 0;
    }

    function setUp() public virtual {
        // Anvil starts at timestamp 1. Several checks subtract a staleness
        // window from `block.timestamp`, so starting near zero would underflow
        // in the test rather than in the contract, and hide real behaviour.
        vm.warp(365 days);

        usdc = new MockUSDC();
        vault = _deployVault(defaultLimits());

        usdc.mint(alice, 1_000_000 * ONE_USDC);
        usdc.mint(bob, 1_000_000 * ONE_USDC);
        usdc.mint(agent, 1_000_000 * ONE_USDC);

        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _deployVault(LemonVault.Limits memory limits) internal returns (LemonVault) {
        return _deployVault(limits, conservativeRisk());
    }

    function _deployVault(LemonVault.Limits memory limits, LemonVault.RiskProfile memory risk)
        internal
        returns (LemonVault)
    {
        return new LemonVault(
            LemonVault.InitParams({
                asset: IERC20(address(usdc)),
                name: "Lemon NVDA Basis",
                symbol: "lmNVDA",
                marketId: MARKET_ID,
                admin: admin,
                agentWallet: agent,
                guardian: guardian,
                insuranceFund: insurance,
                risk: risk,
                limits: limits
            })
        );
    }

    // -- helpers ------------------------------------------------------------

    function _deposit(address who, uint256 assets) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(assets, who);
    }

    function _agentWithdraw(uint256 amount) internal {
        vm.prank(agent);
        vault.agentWithdraw(amount);
    }

    function _agentReturn(uint256 amount) internal {
        vm.prank(agent);
        vault.agentReturn(amount);
    }

    /// @dev Keeps the NAV fresh without asserting any P&L. Reports at mandate.
    function _reportNav(uint256 deployed) internal {
        uint32 leverage = vault.targetLeverageBps();
        vm.prank(agent);
        vault.reportNav(deployed, leverage, uint64(block.timestamp));
    }

    function _reportNavAtLeverage(uint256 deployed, uint32 leverageBps) internal {
        vm.prank(agent);
        vault.reportNav(deployed, leverageBps, uint64(block.timestamp));
    }

    /// @dev Advance time and re-report, so the report interval is never the thing under test.
    function _skipAndReport(uint256 secs, uint256 deployed) internal {
        skip(secs);
        _reportNav(deployed);
    }

    function _requestRedeem(address who, uint256 shares) internal {
        vm.prank(who);
        vault.requestRedeem(shares, who, who);
    }

    function _fulfill(address controller, uint256 shares) internal returns (uint256) {
        vm.prank(agent);
        return vault.fulfillRedeem(controller, shares);
    }
}
