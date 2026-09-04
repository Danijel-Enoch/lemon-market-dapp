// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

/**
 * @dev Deployability, asserted.
 *
 * `VaultFactory` deploys a `LemonVault` directly, so it carries the vault's
 * entire creation bytecode inside its own. That makes the factory's size a
 * function of the vault's, and it sits close enough to the EIP-170 limit that an
 * ordinary feature addition can push it over.
 *
 * Discovering that at deploy time means a failed mainnet transaction and a
 * scramble; discovering it here means a red test. The margin is deliberately
 * asserted as a floor rather than the raw limit, so there is warning before
 * there is breakage.
 */
contract SizesTest is Test {
    /// EIP-170.
    uint256 internal constant MAX_RUNTIME_SIZE = 24_576;

    /// Trip the alarm while there is still room to act.
    uint256 internal constant MIN_MARGIN = 1_000;

    function _runtimeSize(string memory artifact) internal view returns (uint256) {
        return vm.getDeployedCode(artifact).length;
    }

    function test_VaultFactoryIsDeployable() public view {
        uint256 size = _runtimeSize("VaultFactory.sol:VaultFactory");
        assertLt(size, MAX_RUNTIME_SIZE, "VaultFactory exceeds the EIP-170 limit");
        assertLt(
            size,
            MAX_RUNTIME_SIZE - MIN_MARGIN,
            "VaultFactory is within 1kB of the size limit. It embeds LemonVault's creation bytecode, so shrinking the vault is what shrinks it."
        );
    }

    function test_LemonVaultIsDeployable() public view {
        assertLt(
            _runtimeSize("LemonVault.sol:LemonVault"),
            MAX_RUNTIME_SIZE,
            "LemonVault exceeds the EIP-170 limit"
        );
    }

    function test_InsuranceFundIsDeployable() public view {
        assertLt(
            _runtimeSize("InsuranceFund.sol:InsuranceFund"),
            MAX_RUNTIME_SIZE,
            "InsuranceFund exceeds the EIP-170 limit"
        );
    }
}
