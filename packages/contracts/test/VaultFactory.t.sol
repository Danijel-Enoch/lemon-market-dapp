// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract VaultFactoryTest is Test {
    MockUSDC internal usdc;
    VaultFactory internal factory;

    address internal admin = makeAddr("admin");
    address internal vaultAdmin = makeAddr("vaultAdmin");
    address internal guardian = makeAddr("guardian");
    address internal insurance = makeAddr("insurance");
    address internal agentA = makeAddr("agentA");
    address internal agentB = makeAddr("agentB");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant NVDA = keccak256("NVDA");
    bytes32 internal constant TSLA = keccak256("TSLA");

    function _conservative() internal pure returns (LemonVault.RiskProfile memory) {
        return LemonVault.RiskProfile({
            tier: LemonVault.RiskTier.CONSERVATIVE, targetLeverageBps: 10_000, maxLeverageBps: 10_000
        });
    }

    function _leveraged() internal pure returns (LemonVault.RiskProfile memory) {
        return LemonVault.RiskProfile({
            tier: LemonVault.RiskTier.LEVERAGED, targetLeverageBps: 20_000, maxLeverageBps: 30_000
        });
    }

    function _limits() internal pure returns (LemonVault.Limits memory) {
        return LemonVault.Limits({
            managementFeeBps: 200,
            performanceFeeBps: 2000,
            minRedeemDelay: 3 days,
            maxRedeemDelay: 7 days,
            maxDeployedBps: 9000,
            maxNavDeviationBps: 1000,
            maxNavEpochDeviationBps: 5000,
            navEpochDuration: 1 days,
            minNavReportInterval: 5 minutes,
            maxNavStaleness: 6 hours,
            agentWithdrawWindowCap: 1_000_000e6,
            agentWithdrawWindow: 1 days
        });
    }

    function setUp() public {
        vm.warp(365 days);
        usdc = new MockUSDC();
        factory = new VaultFactory(
            IERC20(address(usdc)), admin, vaultAdmin, guardian, insurance, _limits(), _limits()
        );
    }

    function test_CreatesAVaultWiredToTheRightParties() public {
        vm.prank(admin);
        address vaultAddr = factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());

        LemonVault vault = LemonVault(vaultAddr);
        assertEq(vault.marketId(), NVDA);
        assertEq(vault.agentWallet(), agentA);
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.insuranceFund(), insurance);
        assertEq(vault.name(), "Lemon NVDA Basis");
        assertEq(vault.symbol(), "lmNVDA");

        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), vaultAdmin));
        assertTrue(vault.hasRole(vault.AGENT_ROLE(), agentA));
        assertTrue(vault.hasRole(vault.GUARDIAN_ROLE(), guardian));
        assertFalse(
            vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), address(factory)),
            "the factory must not keep authority over what it deploys"
        );
    }

    function test_RegistersTheVaultForEnumeration() public {
        vm.prank(admin);
        address vault = factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());

        assertEq(factory.vaultForMarket(NVDA), vault);
        assertEq(factory.vaultForAgent(agentA), vault);
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaults()[0], vault);
    }

    /// One basis market, one vault — two would compete for the same funding.
    function test_AMarketCannotBeVaultedTwice() public {
        vm.prank(admin);
        address first = factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.MarketAlreadyVaulted.selector, NVDA, first));
        factory.createVault(NVDA, agentB, "Lemon NVDA Basis 2", "lmNVDA2", _conservative());
    }

    /// One agent, one vault — a shared key would make one compromise two losses.
    function test_AnAgentCannotRunTwoVaults() public {
        vm.prank(admin);
        address first = factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.AgentAlreadyAssigned.selector, agentA, first));
        factory.createVault(TSLA, agentA, "Lemon TSLA Basis", "lmTSLA", _conservative());
    }

    function test_DifferentMarketsGetDifferentVaults() public {
        vm.startPrank(admin);
        address nvda = factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());
        address tsla = factory.createVault(TSLA, agentB, "Lemon TSLA Basis", "lmTSLA", _conservative());
        vm.stopPrank();

        assertTrue(nvda != tsla);
        assertEq(factory.vaultCount(), 2);
    }

    function test_OnlyTheVaultAdminRoleCanCreate() public {
        vm.prank(stranger);
        vm.expectRevert();
        factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());
    }

    function test_AgentAddressCannotBeZero() public {
        vm.prank(admin);
        vm.expectRevert(VaultFactory.ZeroAddress.selector);
        factory.createVault(NVDA, address(0), "Lemon NVDA Basis", "lmNVDA", _conservative());
    }

    function test_NewVaultsInheritUpdatedDefaults() public {
        address newInsurance = makeAddr("newInsurance");
        vm.prank(admin);
        factory.setDefaults(vaultAdmin, guardian, newInsurance);

        vm.prank(admin);
        LemonVault vault =
            LemonVault(factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative()));
        assertEq(vault.insuranceFund(), newInsurance);
    }

    /**
     * Defaults are not validated by the factory, so a bad one has to fail at
     * creation rather than be quietly corrected into limits nobody chose.
     */
    function test_UnusableDefaultLimitsFailLoudlyAtCreation() public {
        LemonVault.Limits memory bad = _limits();
        bad.maxNavStaleness = 0;

        vm.prank(admin);
        factory.setDefaultLimits(LemonVault.RiskTier.CONSERVATIVE, bad);

        vm.prank(admin);
        vm.expectRevert(LemonVault.InvalidLimits.selector);
        factory.createVault(NVDA, agentA, "Lemon NVDA Basis", "lmNVDA", _conservative());
    }
}

contract InsuranceFundTest is Test {
    MockUSDC internal usdc;
    InsuranceFund internal fund;
    LemonVault internal vault;

    address internal admin = makeAddr("admin");
    address internal treasurer = makeAddr("treasurer");
    address internal stranger = makeAddr("stranger");
    address internal agent = makeAddr("agent");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");

    uint256 internal constant ONE_USDC = 1e6;

    function setUp() public {
        vm.warp(365 days);
        usdc = new MockUSDC();
        fund = new InsuranceFund(admin, treasurer);

        vault = new LemonVault(
            LemonVault.InitParams({
                asset: IERC20(address(usdc)),
                name: "Lemon NVDA Basis",
                symbol: "lmNVDA",
                marketId: keccak256("NVDA"),
                admin: admin,
                agentWallet: agent,
                guardian: guardian,
                insuranceFund: address(fund),
                risk: LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.CONSERVATIVE, targetLeverageBps: 10_000, maxLeverageBps: 10_000
                }),
                limits: LemonVault.Limits({
                    managementFeeBps: 200,
                    performanceFeeBps: 2000,
                    minRedeemDelay: 3 days,
                    maxRedeemDelay: 7 days,
                    maxDeployedBps: 9000,
                    maxNavDeviationBps: 1000,
                    maxNavEpochDeviationBps: 5000,
                    navEpochDuration: 1 days,
                    minNavReportInterval: 5 minutes,
                    maxNavStaleness: 6 hours,
                    agentWithdrawWindowCap: 1_000_000e6,
                    agentWithdrawWindow: 1 days
                })
            })
        );

        usdc.mint(alice, 1_000_000 * ONE_USDC);
        usdc.mint(address(fund), 100_000 * ONE_USDC);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.deposit(10_000 * ONE_USDC, alice);
    }

    function test_FeesAccrueToTheFundAsShares() public {
        skip(365 days);
        vault.accrueFees();

        assertGt(vault.balanceOf(address(fund)), 0);
        assertApproxEqAbs(
            vault.convertToAssets(vault.balanceOf(address(fund))),
            200 * ONE_USDC,
            1 * ONE_USDC,
            "2% of 10,000"
        );
    }

    /// The operator queues like everyone else — it cannot jump its own queue.
    function test_TheFundExitsThroughTheSameQueue() public {
        skip(365 days);
        vault.accrueFees();
        uint256 shares = vault.balanceOf(address(fund));

        vm.prank(treasurer);
        fund.requestExit(vault, shares);
        assertEq(vault.pendingRedeemRequest(0, address(fund)), shares);

        // Not before the delay, exactly as for a depositor.
        skip(1 days);
        vm.prank(agent);
        vault.reportNav(0, 10_000, uint64(block.timestamp));
        vm.prank(agent);
        vm.expectRevert();
        vault.fulfillRedeem(address(fund), shares);

        skip(3 days);
        vm.prank(agent);
        vault.reportNav(0, 10_000, uint64(block.timestamp));
        vm.prank(agent);
        vault.fulfillRedeem(address(fund), shares);

        vm.prank(treasurer);
        uint256 assets = fund.claimExit(vault, shares, treasurer);
        assertGt(assets, 0);
        assertEq(usdc.balanceOf(treasurer), assets);
    }

    /**
     * A shortfall is absorbed by donation, not by a loan. Nothing is minted, so
     * the whole amount raises the share price for the holders who are still in.
     */
    function test_CoverRaisesTheSharePriceForRemainingHolders() public {
        uint256 ppsBefore = vault.pricePerShare();

        vm.prank(treasurer);
        fund.cover(vault, 1_000 * ONE_USDC);

        assertGt(vault.pricePerShare(), ppsBefore);
        assertEq(vault.totalAssets(), 11_000 * ONE_USDC);
        assertEq(vault.balanceOf(address(fund)), 0, "cover mints nothing to the operator");
    }

    function test_CoverLeavesNoStandingApproval() public {
        vm.prank(treasurer);
        fund.cover(vault, 1_000 * ONE_USDC);
        assertEq(usdc.allowance(address(fund), address(vault)), 0, "no dangling allowance afterwards");
    }

    function test_OnlyATreasurerCanMoveValue() public {
        vm.prank(stranger);
        vm.expectRevert();
        fund.cover(vault, 1);

        vm.prank(stranger);
        vm.expectRevert();
        fund.sweep(IERC20(address(usdc)), stranger, 1);

        vm.prank(stranger);
        vm.expectRevert();
        fund.requestExit(vault, 1);
    }

    function test_SweepMovesProfitOut() public {
        vm.prank(treasurer);
        fund.sweep(IERC20(address(usdc)), treasurer, 50_000 * ONE_USDC);
        assertEq(usdc.balanceOf(treasurer), 50_000 * ONE_USDC);
    }
}
