// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";

/**
 * @notice Deploys the insurance fund and the factory. Vaults come later, from the admin UI.
 *
 * Nothing here creates a vault. A vault needs an agent wallet, and an agent
 * wallet is derived from the NEAR MPC network per vault — so vault creation is
 * inherently a two-system operation and belongs in the admin flow, where the
 * derivation and the transaction happen together.
 */
contract Deploy is Script {
    /// USDC on Base mainnet.
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /**
     * @dev The conservative tier: unlevered, so the position moves with the
     *      basis alone. Tight NAV bounds are affordable here because there is no
     *      leverage to amplify an ordinary day's move.
     */
    function conservativeLimits() public pure returns (LemonVault.Limits memory) {
        return LemonVault.Limits({
            managementFeeBps: 200, // 2%/yr
            performanceFeeBps: 2000, // 20% over high-water mark
            minRedeemDelay: 3 days,
            maxRedeemDelay: 7 days,
            maxDeployedBps: 9000, // 10% stays liquid for the queue
            maxNavDeviationBps: 300, // 3% per report
            maxNavEpochDeviationBps: 1500, // 15% per day
            navEpochDuration: 1 days,
            minNavReportInterval: 15 minutes,
            maxNavStaleness: 6 hours,
            agentWithdrawWindowCap: 500_000e6,
            agentWithdrawWindow: 1 days
        });
    }

    /**
     * @dev The leveraged tier at 2-3x, so both the NAV bounds and the liquidity
     *      buffer are looser and larger respectively.
     *
     *      Looser bounds are not a weaker guarantee here, they are the same
     *      guarantee scaled: at 3x, a 1% move in the basis is a 3% move in the
     *      position, and a bound that rejected that would reject the truth every
     *      other day. An operator whose honest reports keep reverting stops
     *      reporting — and a vault whose agent has stopped reporting goes stale,
     *      which blocks its users. A bound has to be survivable to be useful.
     */
    function leveragedLimits() public pure returns (LemonVault.Limits memory) {
        return LemonVault.Limits({
            managementFeeBps: 200,
            performanceFeeBps: 2000,
            minRedeemDelay: 3 days,
            maxRedeemDelay: 7 days,
            maxDeployedBps: 8500, // a bigger buffer: unwinding leverage takes longer
            maxNavDeviationBps: 800, // 8% per report
            maxNavEpochDeviationBps: 3500, // 35% per day
            navEpochDuration: 1 days,
            minNavReportInterval: 15 minutes,
            maxNavStaleness: 4 hours, // a levered book goes wrong faster
            agentWithdrawWindowCap: 500_000e6,
            agentWithdrawWindow: 1 days
        });
    }

    function run() external returns (VaultFactory factory, InsuranceFund fund) {
        address admin = vm.envAddress("VAULT_ADMIN_ADDRESS");
        address guardian = vm.envAddress("VAULT_GUARDIAN_ADDRESS");
        address treasurer = vm.envAddress("INSURANCE_TREASURER_ADDRESS");
        address asset = vm.envOr("VAULT_ASSET_ADDRESS", BASE_USDC);

        vm.startBroadcast();

        fund = new InsuranceFund(admin, treasurer);
        factory = new VaultFactory(
            IERC20(asset), admin, admin, guardian, address(fund), conservativeLimits(), leveragedLimits()
        );

        vm.stopBroadcast();

        console.log("InsuranceFund:", address(fund));
        console.log("VaultFactory: ", address(factory));
        console.log("Asset:        ", asset);
    }
}
