// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {LemonVault} from "../src/LemonVault.sol";

/**
 * @notice One round of agent reporting on both seeded fork vaults.
 *
 * Split out of `DeployFork.s.sol` because it cannot run in the same breath as
 * the deployment: `minNavReportInterval` is fifteen minutes and the clock starts
 * when the vault is constructed. `fork-up.sh` warps anvil forward and calls this
 * repeatedly, which has a second benefit — a NAV series with several points in
 * it, so the share-price chart and the performance-fee high-water mark are
 * exercised rather than merely rendered from a single sample.
 *
 * `GAIN_BPS` is per round and may be negative, so a losing round is as easy to
 * seed as a winning one. It is clamped by the vault's own per-report bound; the
 * caller's job is to stay inside it, and finding out at what point it does not
 * is a fair use of this script.
 */
contract SeedForkNav is Script {
    function run() external {
        int256 gainBps = vm.envOr("GAIN_BPS", int256(200));

        address conservative = vm.envAddress("FORK_VAULT_CONSERVATIVE");
        address leveraged = vm.envAddress("FORK_VAULT_LEVERAGED");

        // Read back off the vaults rather than passed in. The agent address is
        // immutable and on-chain, so asking the contract is both simpler than
        // threading it through the environment and impossible to get wrong.
        _report(LemonVault(conservative), gainBps, 10_000, "ETH");
        _report(LemonVault(leveraged), gainBps, 20_000, "BTC");
    }

    /**
     * @dev Broadcast as the agent by address.
     *
     * A NEAR-derived agent has no private key anywhere — that is the point of it
     * — so there is nothing to sign with. On a fork we own the node, and anvil's
     * `--auto-impersonate` sends as any address, which is what lets the seeded
     * chain name the real agent wallets and still be driven forward.
     */
    function _report(LemonVault vault, int256 gainBps, uint32 leverageBps, bytes32 perpSymbol) internal {
        uint256 deployed = vault.deployedAssets();
        if (deployed == 0) {
            console.log("skipping, nothing deployed:", address(vault));
            return;
        }

        uint256 delta = (deployed * uint256(gainBps < 0 ? -gainBps : gainBps)) / 10_000;
        uint256 reported = gainBps < 0 ? deployed - delta : deployed + delta;

        vm.startBroadcast(vault.agentWallet());
        vault.reportNav(reported, leverageBps, uint64(block.timestamp));

        // Two rows rather than the deployment's four: this is a round of the
        // position running, not the opening of it. Funding is what a basis trade
        // actually earns between rebalances, and the hedge resize is the only
        // other thing that happens when the position is merely being held.
        LemonVault.ActivityReport[] memory reports = new LemonVault.ActivityReport[](2);
        reports[0] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.FUNDING_SETTLED,
            chain: LemonVault.Chain.SOLANA,
            symbol: perpSymbol,
            baseAmount: 0,
            notionalAssets: 0,
            pnlAssets: gainBps < 0 ? -int256(delta) : int256(delta),
            feeAssets: 0,
            // A distinct ref per round, or the indexer collapses every round's
            // funding into one row and the activity feed shows a single event.
            txRef: abi.encodePacked(
                keccak256(abi.encode(perpSymbol, "fund-a", block.timestamp)),
                keccak256(abi.encode(perpSymbol, "fund-b", block.timestamp))
            ),
            occurredAt: uint64(block.timestamp)
        });
        reports[1] = LemonVault.ActivityReport({
            kind: LemonVault.ActivityKind.PERP_REBALANCE,
            chain: LemonVault.Chain.SOLANA,
            symbol: perpSymbol,
            baseAmount: 0,
            notionalAssets: reported,
            pnlAssets: 0,
            feeAssets: 1e6,
            txRef: abi.encodePacked(
                keccak256(abi.encode(perpSymbol, "rebal-a", block.timestamp)),
                keccak256(abi.encode(perpSymbol, "rebal-b", block.timestamp))
            ),
            occurredAt: uint64(block.timestamp)
        });
        vault.reportActivityBatch(reports);
        vm.stopBroadcast();

        console.log("reported", address(vault), reported);
    }
}
