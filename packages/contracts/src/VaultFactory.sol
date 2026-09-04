// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {LemonVault} from "./LemonVault.sol";

/**
 * @title VaultFactory
 * @notice The admin dashboard's one write path.
 *
 * An operator looks at the basis board, picks a market that has no vault yet,
 * and creates one. The factory is what makes that a single transaction with the
 * invariants already enforced, rather than a deploy script and a hope:
 *
 *  - one vault per market, so two vaults cannot compete for the same funding
 *  - one agent per vault, so a single agent key cannot be the failure point for
 *    two independent books
 *  - one set of default limits, so a vault is never created with the NAV bounds
 *    left at zero because someone was filling in a struct by hand
 *
 * The registry it keeps is also the enumeration the indexer bootstraps from —
 * Ponder reads `VaultCreated` and starts following each vault from its own
 * deployment block.
 */
contract VaultFactory is AccessControl {
    /// @notice May create vaults and change the defaults new vaults inherit.
    bytes32 public constant VAULT_ADMIN_ROLE = keccak256("VAULT_ADMIN_ROLE");

    /// @notice The asset every vault created here takes. USDC on Base.
    IERC20 public immutable asset;

    /// @notice Admin granted on each new vault. Normally the operator multisig.
    address public vaultAdmin;

    /// @notice Guardian granted on each new vault.
    address public guardian;

    /// @notice Where every vault's fee shares are minted.
    address public insuranceFund;

    /**
     * @notice Limits a new vault starts with, one template per risk tier.
     *
     * Two templates rather than one because the tiers genuinely need different
     * numbers. A 3x position moves three times as fast as an unlevered one, so a
     * NAV deviation bound tight enough to be meaningful on the conservative
     * vault would reject the leveraged vault's honest reports on an ordinary
     * day — and an operator whose reports keep reverting stops reporting, which
     * stales the vault and blocks its users.
     */
    mapping(LemonVault.RiskTier tier => LemonVault.Limits) public defaultLimits;

    mapping(bytes32 marketId => address vault) public vaultForMarket;
    mapping(address agent => address vault) public vaultForAgent;
    address[] internal _vaults;

    event VaultCreated(
        address indexed vault,
        bytes32 indexed marketId,
        address indexed agentWallet,
        string name,
        string symbol,
        LemonVault.RiskTier tier,
        uint32 targetLeverageBps,
        uint32 maxLeverageBps
    );
    event DefaultsUpdated(address vaultAdmin, address guardian, address insuranceFund);
    event DefaultLimitsUpdated(LemonVault.RiskTier indexed tier, LemonVault.Limits limits);

    error ZeroAddress();
    error MarketAlreadyVaulted(bytes32 marketId, address vault);
    error AgentAlreadyAssigned(address agent, address vault);

    constructor(
        IERC20 asset_,
        address admin,
        address vaultAdmin_,
        address guardian_,
        address insuranceFund_,
        LemonVault.Limits memory conservativeLimits,
        LemonVault.Limits memory leveragedLimits
    ) {
        if (
            address(asset_) == address(0) || admin == address(0) || vaultAdmin_ == address(0)
                || guardian_ == address(0) || insuranceFund_ == address(0)
        ) revert ZeroAddress();

        asset = asset_;
        vaultAdmin = vaultAdmin_;
        guardian = guardian_;
        insuranceFund = insuranceFund_;
        defaultLimits[LemonVault.RiskTier.CONSERVATIVE] = conservativeLimits;
        defaultLimits[LemonVault.RiskTier.LEVERAGED] = leveragedLimits;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Deploy a vault for one basis market.
     *
     * @param marketId The market's ticker hashed, e.g. `keccak256("NVDA")`. The
     *        board addresses markets by ticker rather than by any venue's pair
     *        index, because those indexes are not stable across protocol
     *        upgrades and a stored one can end up naming a different asset.
     * @param agentWallet The vault's agent — in practice the EVM address the
     *        NEAR MPC network derives for this vault's path. It is baked in as
     *        the only withdrawal destination, so it cannot be changed later.
     */
    function createVault(
        bytes32 marketId,
        address agentWallet,
        string calldata name,
        string calldata symbol,
        LemonVault.RiskProfile calldata risk
    ) external onlyRole(VAULT_ADMIN_ROLE) returns (address vault) {
        return _create(marketId, agentWallet, name, symbol, risk, defaultLimits[risk.tier]);
    }

    /**
     * @notice Create a vault with limits chosen explicitly rather than by tier.
     *
     * For the market that does not fit either template — a thin book that wants
     * a smaller withdrawal window, say. The risk profile is still validated by
     * the vault, so this cannot be used to smuggle 5x into a tier that forbids it.
     */
    function createVaultWithLimits(
        bytes32 marketId,
        address agentWallet,
        string calldata name,
        string calldata symbol,
        LemonVault.RiskProfile calldata risk,
        LemonVault.Limits calldata limits
    ) external onlyRole(VAULT_ADMIN_ROLE) returns (address vault) {
        return _create(marketId, agentWallet, name, symbol, risk, limits);
    }

    function _create(
        bytes32 marketId,
        address agentWallet,
        string calldata name,
        string calldata symbol,
        LemonVault.RiskProfile calldata risk,
        LemonVault.Limits memory limits
    ) internal returns (address vault) {
        if (agentWallet == address(0)) revert ZeroAddress();

        address existing = vaultForMarket[marketId];
        if (existing != address(0)) revert MarketAlreadyVaulted(marketId, existing);

        address agentsVault = vaultForAgent[agentWallet];
        if (agentsVault != address(0)) revert AgentAlreadyAssigned(agentWallet, agentsVault);

        LemonVault.InitParams memory params = LemonVault.InitParams({
            asset: asset,
            name: name,
            symbol: symbol,
            marketId: marketId,
            admin: vaultAdmin,
            agentWallet: agentWallet,
            guardian: guardian,
            insuranceFund: insuranceFund,
            risk: risk,
            limits: limits
        });

        vault = address(new LemonVault(params));

        vaultForMarket[marketId] = vault;
        vaultForAgent[agentWallet] = vault;
        _vaults.push(vault);

        emit VaultCreated(
            vault, marketId, agentWallet, name, symbol, risk.tier, risk.targetLeverageBps, risk.maxLeverageBps
        );
    }

    function vaults() external view returns (address[] memory) {
        return _vaults;
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    function setDefaults(address vaultAdmin_, address guardian_, address insuranceFund_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (vaultAdmin_ == address(0) || guardian_ == address(0) || insuranceFund_ == address(0)) {
            revert ZeroAddress();
        }
        vaultAdmin = vaultAdmin_;
        guardian = guardian_;
        insuranceFund = insuranceFund_;
        emit DefaultsUpdated(vaultAdmin_, guardian_, insuranceFund_);
    }

    /**
     * @dev Not validated here. The vault's own constructor validates, so an
     *      unusable default fails loudly at the next `createVault` rather than
     *      being silently corrected into something nobody chose.
     */
    function setDefaultLimits(LemonVault.RiskTier tier, LemonVault.Limits calldata limits)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        defaultLimits[tier] = limits;
        emit DefaultLimitsUpdated(tier, limits);
    }
}
