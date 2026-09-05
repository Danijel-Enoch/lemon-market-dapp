// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LemonVault} from "../src/LemonVault.sol";

/**
 * @notice The limit templates a new vault inherits, one per risk tier.
 *
 * Kept in its own library rather than inlined into `Deploy.s.sol` so the tests
 * assert against the same numbers the deployment uses. A test whose vaults are
 * looser than the deployed ones does not test the deployment — it tests a vault
 * that does not exist, and the NAV bounds are exactly the part most worth
 * exercising.
 */
library VaultLimits {
    /**
     * @dev The conservative tier: unlevered, so the position moves with the
     *      basis alone. Tight NAV bounds are affordable here because there is no
     *      leverage to amplify an ordinary day's move.
     */
    function conservative() internal pure returns (LemonVault.Limits memory) {
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
    function leveraged() internal pure returns (LemonVault.Limits memory) {
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
}
