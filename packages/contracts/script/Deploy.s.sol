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
    /// USDC on Base mainnet. Circle-issued.
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    /// Native USDC on Arbitrum One — deliberately not the bridged `USDC.e`.
    address internal constant ARBITRUM_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    /// Bridged USDC on X Layer. There is no Circle-native issuance on this chain.
    address internal constant XLAYER_USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;

    /**
     * @notice The quote asset this chain's vaults settle in.
     * @dev Reverts rather than falling back. A default would mean a deploy aimed at the
     *      wrong `--rpc-url` succeeds against Base's USDC address on a chain where nothing
     *      is deployed at it, producing a factory whose every vault reverts on deposit.
     *      Pass `VAULT_ASSET_ADDRESS` to deploy against anything not listed here.
     */
    function defaultAsset() internal view returns (address) {
        if (block.chainid == 8453) return BASE_USDC;
        if (block.chainid == 42161) return ARBITRUM_USDC;
        if (block.chainid == 196) return XLAYER_USDC;
        revert(
            "No default asset for this chain. Set VAULT_ASSET_ADDRESS to the USDC you mean, or add the chain to Deploy.s.sol."
        );
    }

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
        address asset = vm.envOr("VAULT_ASSET_ADDRESS", defaultAsset());

        // The asset has to *be* a contract. On a chain whose USDC address was taken from a
        // list rather than read off the chain, the failure is otherwise silent: the factory
        // deploys, every vault it makes points at an empty account, and `deposit` reverts
        // with no reason string months later. `extcodesize` catches it here for free.
        uint256 assetCode;
        assembly {
            assetCode := extcodesize(asset)
        }
        require(assetCode > 0, "VAULT_ASSET_ADDRESS has no code on this chain");

        vm.startBroadcast();

        fund = new InsuranceFund(admin, treasurer);
        factory = new VaultFactory(
            IERC20(asset), admin, admin, guardian, address(fund), conservativeLimits(), leveragedLimits()
        );

        vm.stopBroadcast();

        console.log("Chain id:     ", block.chainid);
        console.log("InsuranceFund:", address(fund));
        console.log("VaultFactory: ", address(factory));
        console.log("Asset:        ", asset);
    }
}
