// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {LemonVault} from "./LemonVault.sol";

/**
 * @title InsuranceFund
 * @notice Where every vault's fees land, and the only thing that can hand value back.
 *
 * The 2% management and 20% performance fees are minted as *shares* of the
 * vault that earned them, so the operator's take is not a USDC transfer out of
 * a working position — it stays invested alongside depositors and is subject to
 * the same NAV. Realising it means queueing a redemption like anyone else, on
 * the same 3-7 day terms.
 *
 * The second job is the one the name is about. A basis position can end a day
 * worth less than the vault's liabilities — a funding flip, an ADL that shrank
 * the hedge, a spot leg that could not be exited at the marked price. `cover`
 * sends USDC into a vault with nothing minted against it, which raises that
 * vault's share price for its remaining holders. It is a donation, deliberately:
 * a loan would need repayment terms, and a vault that owes the operator money is
 * a vault whose share price is not what it says it is.
 */
contract InsuranceFund is AccessControl {
    using SafeERC20 for IERC20;

    /// @notice May move value out of the fund, including covering a vault.
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    event ExitRequested(address indexed vault, uint256 shares);
    event ExitClaimed(address indexed vault, uint256 shares, uint256 assets);
    event Covered(address indexed vault, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();

    constructor(address admin, address treasurer) {
        if (admin == address(0) || treasurer == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
        _grantRole(TREASURER_ROLE, treasurer);
    }

    /**
     * @notice Queue some of this fund's shares in `vault` for redemption.
     *
     * The fund takes the same delay as a depositor. Letting the operator jump
     * the queue would mean the party that decides when to unwind is also the
     * party that benefits from unwinding early.
     */
    function requestExit(LemonVault vault, uint256 shares) external onlyRole(TREASURER_ROLE) {
        if (shares == 0) revert ZeroAmount();
        vault.requestRedeem(shares, address(this), address(this));
        emit ExitRequested(address(vault), shares);
    }

    /// @notice Claim a fulfilled redemption into this fund.
    function claimExit(LemonVault vault, uint256 shares, address receiver)
        external
        onlyRole(TREASURER_ROLE)
        returns (uint256 assets)
    {
        if (receiver == address(0)) revert ZeroAddress();
        assets = vault.redeem(shares, receiver, address(this));
        emit ExitClaimed(address(vault), shares, assets);
    }

    /**
     * @notice Send USDC into a vault to absorb a shortfall.
     *
     * Uses the vault's `agentReturn`, which is open to any caller precisely so
     * that returning capital is never gated on holding a key. Nothing is minted,
     * so the entire amount accrues to the vault's existing holders.
     */
    function cover(LemonVault vault, uint256 amount) external onlyRole(TREASURER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        IERC20 asset = IERC20(vault.asset());
        asset.forceApprove(address(vault), amount);
        vault.agentReturn(amount);
        asset.forceApprove(address(vault), 0);
        emit Covered(address(vault), amount);
    }

    /// @notice Move any token out of the fund. The operator's own profit exits this way.
    function sweep(IERC20 token, address to, uint256 amount) external onlyRole(TREASURER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Swept(address(token), to, amount);
    }
}
