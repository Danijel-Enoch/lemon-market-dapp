// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {InsuranceFund} from "../src/InsuranceFund.sol";
import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {VaultLimits} from "./Limits.sol";

/**
 * @notice The whole protocol on an anvil fork of Base mainnet, with activity in it.
 *
 * The difference from `DeployLocal.s.sol` is what it stands on. That script
 * mints its own USDC and gives its vaults deliberately loose limits so a demo
 * chain can be driven quickly. This one takes the **real** Circle USDC at its
 * real address and the **real** limit templates production deploys with, so the
 * markets the agent trades into are the actual Base pools with the actual depth
 * — which is the only way to find out whether a 3% per-report NAV bound is
 * survivable against prices that move on their own.
 *
 * USDC is not minted here. Cheatcode storage writes do not reach the node a
 * broadcast script is talking to, so funding happens over anvil's RPC before
 * this runs (see `scripts/fork-up.sh`, which impersonates USDC's masterMinter).
 * By the time `run()` starts, the deployer and Alice already hold real USDC.
 *
 * Fork only. `Deploy.s.sol` is the real one.
 */
contract DeployFork is Script {
    /// Anvil's first two accounts, and two agent keys derived from nothing in particular.
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant ALICE_PK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant AGENT_A_PK = 0x0aaa;
    uint256 internal constant AGENT_B_PK = 0x0bbb;

    /// USDC on Base mainnet — the fork inherits Circle's real contract and its real supply.
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        address deployer = vm.addr(DEPLOYER_PK);
        address alice = vm.addr(ALICE_PK);
        // By default the agents are local keys, so this script can play them
        // forward itself and leave a chain with activity on it. Pass the NEAR
        // MPC addresses (`bun run scripts/agent-addresses.ts --env`) to hand the
        // vaults to the real agent process instead — the wallet is immutable
        // once the factory is called, so it has to be right at creation time.
        address agentA = vm.envOr("AGENT_A_ADDRESS", vm.addr(AGENT_A_PK));
        address agentB = vm.envOr("AGENT_B_ADDRESS", vm.addr(AGENT_B_PK));

        IERC20 usdc = IERC20(vm.envOr("VAULT_ASSET_ADDRESS", BASE_USDC));

        // Fail loudly rather than deploying a protocol nobody can deposit into.
        // A zero balance here means the funding step in `fork-up.sh` did not run
        // or did not take, and every deposit below would revert one by one with
        // an error that says nothing about why.
        require(
            usdc.balanceOf(deployer) >= 1_000_000e6,
            "fork: deployer holds no USDC; run the funding step first"
        );
        require(usdc.balanceOf(alice) >= 100_000e6, "fork: alice holds no USDC; run the funding step first");

        // --- deploy -------------------------------------------------------
        vm.startBroadcast(DEPLOYER_PK);

        InsuranceFund fund = new InsuranceFund(deployer, deployer);
        VaultFactory factory = new VaultFactory(
            usdc,
            deployer,
            deployer,
            deployer,
            address(fund),
            VaultLimits.conservative(),
            VaultLimits.leveraged()
        );

        // ETH and BTC rather than a tokenized stock: both have a deep KyberSwap
        // route on Base and a live Pacifica perp, so the agent's spot leg has
        // something real to fill against on this fork.
        LemonVault conservative = LemonVault(
            factory.createVault(
                keccak256("ETH"),
                agentA,
                "Lemon ETH Basis Conservative",
                "lmETHC",
                LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.CONSERVATIVE, targetLeverageBps: 10_000, maxLeverageBps: 10_000
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
                    tier: LemonVault.RiskTier.LEVERAGED, targetLeverageBps: 20_000, maxLeverageBps: 30_000
                })
            )
        );

        // The agents' gas is set over anvil's RPC by `fork-up.sh`, not sent from
        // here: a `.transfer` to an account that does not exist yet cannot pay
        // for its own creation out of the 2300-gas stipend, and on a real chain
        // a faucet would have done it anyway.
        require(
            agentA.balance > 0 && agentB.balance > 0, "fork: agents have no gas; run the funding step first"
        );

        // --- depositors ---------------------------------------------------
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

        // --- the agents take their capital --------------------------------
        // Reporting a valuation is *not* done here. `minNavReportInterval` is
        // fifteen minutes and the clock starts at vault construction, so the
        // first honest report is fifteen minutes away — a real constraint that a
        // demo script must not paper over by loosening the limits. `fork-up.sh`
        // advances anvil's clock and runs `SeedForkNav.s.sol` instead, which
        // also lets it produce a NAV series with more than one point in it.
        _deploy(conservative, agentA, 9000);
        _deploy(leveraged, agentB, 8500);

        console.log("USDC          ", address(usdc));
        console.log("InsuranceFund ", address(fund));
        console.log("VaultFactory  ", address(factory));
        console.log("Conservative  ", address(conservative));
        console.log("Leveraged     ", address(leveraged));
        console.log("Deployer      ", deployer);
        console.log("Alice         ", alice);
        console.log("AgentA        ", agentA);
        console.log("AgentB        ", agentB);
    }

    /**
     * @dev Pull the tier's maximum out to the agent, which is what makes the idle
     *      buffer visible on the vault page.
     *
     * Broadcast by address rather than by key. The agent is normally a NEAR MPC
     * derivation with no private key anywhere, so there is nothing to sign with —
     * but this is a fork, we own the node, and anvil's `--auto-impersonate` will
     * send as any address. That is what lets the seeded chain name the *real*
     * agent wallets and still be played forward.
     */
    function _deploy(LemonVault vault, address agent, uint256 maxDeployedBps) internal {
        vm.startBroadcast(agent);
        vault.agentWithdraw((vault.totalAssets() * maxDeployedBps) / 10_000);
        vm.stopBroadcast();
    }
}
