// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC7540Redeem
 * @notice The asynchronous-redemption half of ERC-7540.
 *
 * A Lemon vault's capital is not sitting in the vault. It is a spot position on
 * Base and a short perp on Pacifica, and unwinding it is a decision about
 * timing rather than a transfer — so redemption cannot be the single atomic
 * call ERC-4626 assumes. ERC-7540 is the standard shape for exactly that: a
 * user *requests*, the operator fulfils later, the user *claims*.
 *
 * Only the redeem side is asynchronous here. Deposits stay synchronous, because
 * incoming USDC needs no unwind — it is idle the moment it lands, and the share
 * price it buys at is already known.
 */
interface IERC7540Redeem {
    /// @notice A redemption was requested. `shares` have left `owner` and sit in escrow.
    event RedeemRequest(
        address indexed controller,
        address indexed owner,
        uint256 indexed requestId,
        address sender,
        uint256 shares
    );

    /// @notice An account was authorised to act on another's requests.
    event OperatorSet(address indexed controller, address indexed operator, bool approved);

    /**
     * @notice Escrow `shares` and queue them for redemption.
     * @param shares Amount to redeem.
     * @param controller Account that will fulfil-track and claim the request.
     * @param owner Account the shares come from.
     * @return requestId Identifier for the request.
     */
    function requestRedeem(uint256 shares, address controller, address owner)
        external
        returns (uint256 requestId);

    /// @notice Shares requested but not yet fulfilled.
    function pendingRedeemRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 shares);

    /// @notice Shares fulfilled and awaiting a `redeem`/`withdraw` claim.
    function claimableRedeemRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 shares);

    /// @notice Authorise `operator` to manage requests on behalf of `msg.sender`.
    function setOperator(address operator, bool approved) external returns (bool);

    /// @notice Whether `operator` may act for `controller`.
    function isOperator(address controller, address operator) external view returns (bool);
}
