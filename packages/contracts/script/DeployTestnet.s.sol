// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {InsuranceFund} from "../src/InsuranceFund.sol";
import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {VaultLimits} from "./Limits.sol";

/**
 * @notice USDC's stand-in on a chain that has none.
 *
 * Six decimals, because the vault's decimals offset is derived from the gap
 * between the asset's decimals and the share's — an 18-decimal test token would
 * exercise different share maths than production and prove nothing about it.
 *
 * `mint` is open by design. This is the faucet: anyone testing needs a balance,
 * and gating it behind an owner would mean every tester asking the deployer.
 * Deploy it only where that is obviously fine, which is the only place this
 * script runs.
 */
contract FaucetUSDC is ERC20 {
    constructor() ERC20("Lemon Test USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @notice The protocol on a public testnet, with vaults already in it.
 *
 * Separate from `Deploy.s.sol` because a testnet needs two things production
 * does not. It may have no USDC — Vibenet does not — so one is deployed when no
 * asset address is given. And it needs vaults to exist without an operator
 * walking the admin flow first, because the point of putting it on a testnet is
 * for somebody to open the app and find something there.
 *
 * The limits are production's, from `VaultLimits`. A testnet whose vaults are
 * looser than mainnet's tests a protocol that will never be deployed.
 *
 * Base Sepolia has Circle's own test USDC, so pass it:
 *   VAULT_ASSET_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * On Vibenet, leave it unset and a FaucetUSDC is deployed instead.
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // One key, three roles. On mainnet these are separate — the guardian
        // exists so somebody other than the operator can pause — but a testnet
        // with three multisigs to fund is a testnet nobody sets up.
        address admin = vm.envOr("VAULT_ADMIN_ADDRESS", deployer);
        address guardian = vm.envOr("VAULT_GUARDIAN_ADDRESS", deployer);
        address treasurer = vm.envOr("INSURANCE_TREASURER_ADDRESS", deployer);

        address configuredAsset = vm.envOr("VAULT_ASSET_ADDRESS", address(0));

        // Deterministic from the deployer key, so a re-run reaches the same
        // agents and the addresses can be written into .env before the deploy.
        uint256 agentAPk = uint256(keccak256(abi.encode(pk, "lemon-agent-a")));
        uint256 agentBPk = uint256(keccak256(abi.encode(pk, "lemon-agent-b")));
        // Deterministic local agents by default. In a deployment the live agent
        // process is meant to run, override with the NEAR MPC addresses from
        // `bun run scripts/agent-addresses.ts --env` — the vault bakes the
        // address in permanently, so a vault created with the wrong one can
        // never trade.
        address agentA = vm.envOr("AGENT_A_ADDRESS", vm.addr(agentAPk));
        address agentB = vm.envOr("AGENT_B_ADDRESS", vm.addr(agentBPk));

        vm.startBroadcast(pk);

        IERC20 asset;
        if (configuredAsset == address(0)) {
            asset = IERC20(address(new FaucetUSDC()));
            FaucetUSDC(address(asset)).mint(deployer, 1_000_000e6);
        } else {
            asset = IERC20(configuredAsset);
        }

        InsuranceFund fund = new InsuranceFund(admin, treasurer);
        VaultFactory factory = new VaultFactory(
            asset, admin, admin, guardian, address(fund), VaultLimits.conservative(), VaultLimits.leveraged()
        );

        address conservative;
        address leveraged;
        if (vm.envOr("SEED_VAULTS", true)) {
            conservative = factory.createVault(
                keccak256("ETH"),
                agentA,
                "Lemon ETH Basis Conservative",
                "lmETHC",
                LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.CONSERVATIVE, targetLeverageBps: 10_000, maxLeverageBps: 10_000
                })
            );
            leveraged = factory.createVault(
                keccak256("BTC"),
                agentB,
                "Lemon BTC Basis Leveraged",
                "lmBTCL",
                LemonVault.RiskProfile({
                    tier: LemonVault.RiskTier.LEVERAGED, targetLeverageBps: 20_000, maxLeverageBps: 30_000
                })
            );

            // Gas for the agents. A raw call rather than `.transfer`, whose
            // 2300-gas stipend cannot cover creating an account that does not
            // exist yet — which is exactly the case for a fresh agent address.
            uint256 agentGas = vm.envOr("AGENT_GAS_WEI", uint256(0.002 ether));
            if (agentGas > 0 && deployer.balance > agentGas * 3) {
                (bool okA,) = agentA.call{value: agentGas}("");
                (bool okB,) = agentB.call{value: agentGas}("");
                require(okA && okB, "could not fund the agents");
            }
        }

        vm.stopBroadcast();

        console.log("Chain         ", block.chainid);
        console.log("Deployer      ", deployer);
        console.log("Asset         ", address(asset));
        console.log("InsuranceFund ", address(fund));
        console.log("VaultFactory  ", address(factory));
        console.log("StartBlock    ", block.number);
        console.log("Conservative  ", conservative);
        console.log("Leveraged     ", leveraged);
        console.log("AgentA        ", agentA);
        console.log("AgentB        ", agentB);
    }
}
