// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev Six decimals, matching USDC on Base.
 *
 * The decimal count is the point of this mock. A vault whose share maths is
 * only ever exercised against an 18-decimal token will pass its tests and then
 * misprice every real deposit, because the decimals offset that defends the
 * first depositor is derived from the gap between the two.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
