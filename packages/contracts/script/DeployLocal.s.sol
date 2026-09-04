// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {InsuranceFund} from "../src/InsuranceFund.sol";
import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/**
 * @notice A whole working protocol on a local chain, with activity in it.
 *
 * Deploys a mock USDC, the insurance fund and the factory; creates one vault of
 * each risk tier; funds two depositors; then plays the agents forward — pulling
 * capital, reporting a valuation, publishing trades across two chains, and
 * leaving a withdrawal in the queue.
 *
 * The point of producing real events rather than fixtures is that the indexer,
 * the API and the app are then exercised against the contracts' actual output. A
 * mismatch between an ABI and a handler shows up here; fixtures would agree with
 * whatever they were written against and hide it.
 *
 * Local only. `Deploy.s.sol` is the real one.
 */
contract DeployLocal is Script {
    /// Anvil's first two accounts, and two agent keys derived from nothing in particular.
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant ALICE_PK =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant AGENT_A_PK = 0x0aaa;
    uint256 internal constant AGENT_B_PK = 0x0bbb;

    /**
     * @dev Demo limits.
     *
     * The NAV report interval is zero and the staleness window is a month, so a
     * seeded chain can be driven through several valuations in one script and
     * will not go stale while someone is looking at it. The withdrawal delay is
     * left at the real three days precisely because the queue countdown is one
     * of the things worth seeing.
     */
    function localLimits() public pure returns (LemonVault.Limits memory) {
        return LemonVault.Limits({
            managementFeeBps: 200,
            performanceFeeBps: 2000,
            minRedeemDelay: 3 days,
            maxRedeemDelay: 7 days,
            maxDeployedBps: 9000,
            maxNavDeviationBps: 1000,
            maxNavEpochDeviationBps: 5000,
            navEpochDuration: 1 days,
            minNavReportInterval: 0,
            maxNavStaleness: 30 days,
            agentWithdrawWindowCap: 10_000_000e6,
            agentWithdrawWindow: 1 days
        });
    }

    function run() external {
        address deployer = vm.addr(DEPLOYER_PK);
        address alice = vm.addr(ALICE_PK);
        address agentA = vm.addr(AGENT_A_PK);
        address agentB = vm.addr(AGENT_B_PK);

        // --- deploy -------------------------------------------------------
        vm.startBroadcast(DEPLOYER_PK);

        MockUSDC usdc = new MockUSDC();
        InsuranceFund fund = new InsuranceFund(deployer, deployer);
        VaultFactory factory = new VaultFactory(
            IERC20(address(usdc)),
            deployer,
            deployer,
            deployer,
            address(fund),
            localLimits(),
            localLimits()
        );

        LemonVault conservative = LemonVault(
            factory.createVault(
                keccak256("NVDA"),
                agentA,
                "Lemon NVDA Basis Conservative",
                "lmNVDAC",
                LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.CONSERVATIVE,
                    targetLeverageBps: 10_000,
                    maxLeverageBps: 10_000
                })
            )
        );

        LemonVault leveraged = LemonVault(
            factory.createVault(
                keccak256("BTC"),
                agentB,
                "Lemon BTC Basis Leveraged",
                "lmBTCL",
                LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.LEVERAGED,
                    targetLeverageBps: 20_000,
                    maxLeverageBps: 30_000
                })
            )
        );

        // Gas for the agents, which are ordinary EOAs here.
        payable(agentA).transfer(1 ether);
        payable(agentB).transfer(1 ether);
        payable(alice).transfer(1 ether);

        // --- depositors ---------------------------------------------------
        usdc.mint(deployer, 1_000_000e6);
        usdc.mint(alice, 100_000e6);

        usdc.approve(address(conservative), type(uint256).max);
        usdc.approve(address(leveraged), type(uint256).max);
        conservative.deposit(25_000e6, deployer);
        leveraged.deposit(12_000e6, deployer);

        vm.stopBroadcast();

        vm.startBroadcast(ALICE_PK);
        usdc.approve(address(conservative), type(uint256).max);
        conservative.deposit(8_000e6, alice);
        // Leaves a request in the queue so the countdown has something to count.
        conservative.requestRedeem(2_000e18, alice, alice);
        vm.stopBroadcast();

        // --- the agents go to work ----------------------------------------
        _runAgent(conservative, AGENT_A_PK, "NVDAc", "NVDA", 10_000);
        _runAgent(leveraged, AGENT_B_PK, "cbBTC", "BTC", 20_000);

        console.log("USDC          ", address(usdc));
        console.log("InsuranceFund ", address(fund));
        console.log("VaultFactory  ", address(factory));
        console.log("Conservative  ", address(conservative));
        console.log("Leveraged     ", address(leveraged));
        console.log("Deployer      ", deployer);
        console.log("Alice         ", alice);
    }

    /// @dev Pull capital, report a gain, and publish the trades that produced it.
    function _runAgent(
        LemonVault vault,
        uint256 agentPk,
        bytes32 spotSymbol,
        bytes32 perpSymbol,
        uint32 leverageBps
    ) internal {
        vm.startBroadcast(agentPk);

        uint256 deployable = (vault.totalAssets() * 9000) / 10_000;
        vault.agentWithdraw(deployable);

        // A 2% gain on the deployed capital — inside the per-report bound, so
        // the contract accepts it and the share price moves visibly.
        uint256 reported = deployable + (deployable * 200) / 10_000;
        vault.reportNav(reported, leverageBps, uint64(block.timestamp));

        LemonVault.ActivityReport[] memory reports = new LemonVault.ActivityReport[](4);
        reports[0] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.SPOT_BUY,
            chain: LemonVault.Chain.BASE,
            symbol: spotSymbol,
            baseAmount: 42e18,
            notionalAssets: (deployable * 6000) / 10_000,
            pnlAssets: 0,
            feeAssets: 6e6,
            txRef: abi.encodePacked(keccak256(abi.encode(spotSymbol, "spot-buy"))),
            occurredAt: uint64(block.timestamp)
        });
        reports[1] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.BRIDGE_OUT,
            chain: LemonVault.Chain.BASE,
            symbol: "USDC",
            baseAmount: (deployable * 4000) / 10_000,
            notionalAssets: (deployable * 4000) / 10_000,
            pnlAssets: 0,
            feeAssets: 1e6,
            txRef: abi.encodePacked(keccak256(abi.encode(spotSymbol, "bridge"))),
            occurredAt: uint64(block.timestamp)
        });
        // 64 bytes, the shape of a real Solana signature — which is the whole
        // reason `txRef` is `bytes` rather than `bytes32`.
        reports[2] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.PERP_OPEN,
            chain: LemonVault.Chain.SOLANA,
            symbol: perpSymbol,
            baseAmount: 42e18,
            notionalAssets: (deployable * 6000) / 10_000,
            pnlAssets: 0,
            feeAssets: 6e6,
            txRef: abi.encodePacked(
                keccak256(abi.encode(perpSymbol, "perp-a")), keccak256(abi.encode(perpSymbol, "perp-b"))
            ),
            occurredAt: uint64(block.timestamp)
        });
        reports[3] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.FUNDING_SETTLED,
            chain: LemonVault.Chain.SOLANA,
            symbol: perpSymbol,
            baseAmount: 0,
            notionalAssets: 0,
            pnlAssets: int256((deployable * 200) / 10_000),
            feeAssets: 0,
            txRef: abi.encodePacked(
                keccak256(abi.encode(perpSymbol, "fund-a")), keccak256(abi.encode(perpSymbol, "fund-b"))
            ),
            occurredAt: uint64(block.timestamp)
        });

        vault.reportActivityBatch(reports);
        vm.stopBroadcast();
    }
}
