// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/**
 * @dev Drives the vault through arbitrary interleavings of everything it supports.
 *
 * Every action is wrapped in `try`. Most random calls *should* revert — a
 * redemption before its delay, a NAV report outside the bound, a deposit against
 * a stale price — and treating those as failures would mean the fuzzer only ever
 * explored the handful of sequences that happen to be legal end to end. What
 * matters is that the vault's books balance whether a call landed or not.
 */
contract VaultHandler is Test {
    MockUSDC public usdc;
    LemonVault public vault;

    address public agent;
    address[] public actors;

    /// Ghost: net USDC handed to the agent, to check against its actual balance.
    uint256 public sentToAgent;
    uint256 public returnedByAgent;

    constructor(MockUSDC usdc_, LemonVault vault_, address agent_, address[] memory actors_) {
        usdc = usdc_;
        vault = vault_;
        agent = agent_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function deposit(uint256 actorSeed, uint256 amount) external {
        address who = _actor(actorSeed);
        amount = bound(amount, 1, 100_000e6);
        if (usdc.balanceOf(who) < amount) return;
        vm.prank(who);
        try vault.deposit(amount, who) {} catch {}
    }

    function requestRedeem(uint256 actorSeed, uint256 pct) external {
        address who = _actor(actorSeed);
        uint256 held = vault.balanceOf(who);
        if (held == 0) return;
        uint256 shares = (held * bound(pct, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(who);
        try vault.requestRedeem(shares, who, who) {} catch {}
    }

    function fulfill(uint256 actorSeed, uint256 pct) external {
        address who = _actor(actorSeed);
        uint256 pending = vault.pendingRedeemRequest(0, who);
        if (pending == 0) return;
        uint256 shares = (pending * bound(pct, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(agent);
        try vault.fulfillRedeem(who, shares) {} catch {}
    }

    function claim(uint256 actorSeed, uint256 pct) external {
        address who = _actor(actorSeed);
        uint256 claimable = vault.maxRedeem(who);
        if (claimable == 0) return;
        uint256 shares = (claimable * bound(pct, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(who);
        try vault.redeem(shares, who, who) {} catch {}
    }

    function agentWithdraw(uint256 amount) external {
        amount = bound(amount, 1, 200_000e6);
        vm.prank(agent);
        try vault.agentWithdraw(amount) {
            sentToAgent += amount;
        } catch {}
    }

    function agentReturn(uint256 amount) external {
        amount = bound(amount, 1, usdc.balanceOf(agent));
        if (amount == 0) return;
        vm.prank(agent);
        try vault.agentReturn(amount) {
            returnedByAgent += amount;
        } catch {}
    }

    /// Proposes values near the current position, so a useful share are accepted.
    function reportNav(uint256 deltaSeed, bool up) external {
        uint256 deployed = vault.deployedAssets();
        uint256 delta = (deployed * bound(deltaSeed, 0, 1500)) / 10_000;
        uint256 target = up ? deployed + delta : deployed - delta;
        uint32 leverage = vault.targetLeverageBps();
        vm.prank(agent);
        try vault.reportNav(target, leverage, uint64(block.timestamp)) {} catch {}
    }

    function accrueFees() external {
        try vault.accrueFees() {} catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1 minutes, 5 days));
    }
}

contract LemonVaultInvariantTest is Test {
    MockUSDC internal usdc;
    LemonVault internal vault;
    VaultHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent");
    address internal guardian = makeAddr("guardian");
    address internal insurance = makeAddr("insurance");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.warp(365 days);
        usdc = new MockUSDC();

        vault = new LemonVault(
            LemonVault.InitParams({
                asset: IERC20(address(usdc)),
                name: "Lemon NVDA Basis",
                symbol: "lmNVDA",
                marketId: keccak256("NVDA"),
                admin: admin,
                agentWallet: agent,
                guardian: guardian,
                insuranceFund: insurance,
                risk: LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.LEVERAGED, targetLeverageBps: 20_000, maxLeverageBps: 30_000
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
                    agentWithdrawWindowCap: 10_000_000e6,
                    agentWithdrawWindow: 1 days
                })
            })
        );

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = insurance;

        handler = new VaultHandler(usdc, vault, agent, actors);

        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], 1_000_000e6);
            vm.prank(actors[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
        vm.prank(agent);
        usdc.approve(address(vault), type(uint256).max);

        targetContract(address(handler));
    }

    // -----------------------------------------------------------------------

    /// Escrowed shares are real shares. The vault's own balance must equal the queue.
    function invariant_EscrowMatchesTheQueue() public view {
        assertEq(vault.balanceOf(address(vault)), vault.totalPendingRedeemShares());
    }

    /**
     * Assets promised to a fulfilled redemption must actually be in the contract.
     *
     * This is the solvency property for exiting users: once a redemption is
     * priced, the money to pay it is here and is not counted as anyone else's.
     */
    function invariant_PromisedAssetsAreHeld() public view {
        assertLe(vault.claimableAssets(), usdc.balanceOf(address(vault)));
    }

    /// Per-controller claims must sum to the vault's own total, with nothing stranded.
    function invariant_ClaimsReconcile() public view {
        address[3] memory who = [alice, bob, insurance];
        uint256 sumAssets;
        uint256 sumPending;
        for (uint256 i = 0; i < who.length; i++) {
            (uint256 pending,, uint256 claimAssets,,,) = vault.redeemStateOf(who[i]);
            sumAssets += claimAssets;
            sumPending += pending;
        }
        assertEq(sumAssets, vault.claimableAssets(), "claims must reconcile");
        assertEq(sumPending, vault.totalPendingRedeemShares(), "pending must reconcile");
    }

    /// The valuation identity, which everything else prices off.
    function invariant_TotalAssetsIdentity() public view {
        uint256 idle = usdc.balanceOf(address(vault));
        uint256 gross = idle + vault.deployedAssets();
        uint256 expected = gross > vault.claimableAssets() ? gross - vault.claimableAssets() : 0;
        assertEq(vault.totalAssets(), expected);
    }

    /**
     * The agent's balance is exactly what the vault sent it, less what it
     * returned. A NAV report claiming a gain must never move a token.
     */
    function invariant_AgentHoldsOnlyWhatItWasSent() public view {
        // The agent starts with nothing, so its balance is purely the net of
        // what the vault handed it.
        uint256 expected = handler.sentToAgent() - handler.returnedByAgent();
        assertEq(usdc.balanceOf(agent), expected, "reporting must not mint USDC");
    }

    /// Nobody can hold more shares than exist.
    function invariant_SupplyCoversHoldings() public view {
        uint256 held = vault.balanceOf(alice) + vault.balanceOf(bob) + vault.balanceOf(insurance)
            + vault.balanceOf(address(vault));
        assertLe(held, vault.totalSupply());
    }

    /// The mandate holds no matter what sequence got us here.
    function invariant_LeverageStaysWithinTheMandate() public view {
        assertLe(vault.lastObservedLeverageBps(), vault.maxLeverageBps());
    }

    /// The high-water mark only ever moves up, or resets to par on an empty vault.
    function invariant_HighWaterMarkIsSane() public view {
        assertGt(vault.highWaterMarkPps(), 0, "a zero mark would make every price a new peak");
    }
}
