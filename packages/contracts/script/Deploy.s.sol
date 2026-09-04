// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LemonVault} from "../src/LemonVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {VaultLimits} from "./Limits.sol";

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

    /// @dev Kept as functions so a caller can read the templates without a deploy.
    function conservativeLimits() public pure returns (LemonVault.Limits memory) {
        return VaultLimits.conservative();
    }

    function leveragedLimits() public pure returns (LemonVault.Limits memory) {
        return VaultLimits.leveraged();
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
