// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IERC7540Redeem} from "./interfaces/IERC7540Redeem.sol";

/**
 * @title LemonVault
 * @notice One vault, one basis market, one agent.
 *
 * Users deposit USDC and are minted shares immediately. The capital does not
 * stay here: an off-chain agent pulls it, buys the spot leg on Base, bridges
 * margin to Pacifica, and shorts the matching perp. Because most of the value
 * therefore lives somewhere this contract cannot read, the agent reports it —
 * and the whole security design of this file is about making that report a
 * bounded claim rather than an unchecked one.
 *
 * What is on-chain:
 *  - custody of idle USDC and of shares escrowed for redemption
 *  - share accounting, including the fee dilution
 *  - the redemption queue, which is what gives withdrawals their 3-7 day shape
 *  - hard limits on everything the agent key can do
 *
 * What is deliberately not on-chain: which trades to place, when to place them,
 * and what the position is worth. Those need venue data this chain cannot see.
 *
 * ## The trust boundary
 *
 * A compromised agent key must not be able to empty the vault or mint itself
 * shares. Four separate limits stand between it and the funds:
 *
 *  1. It can only move USDC to one immutable address (`agentWallet`), never to
 *     an arbitrary recipient.
 *  2. It can only move a capped amount per rolling window, and never more than
 *     `maxDeployedBps` of the vault, so an idle buffer always remains.
 *  3. Its NAV report is bounded twice — per report and per epoch — so inflating
 *     the share price is slow and visible rather than instant.
 *  4. A guardian can pause it, and pausing never blocks a user from queueing an
 *     exit.
 *
 * None of that makes the agent trustless. It makes the agent's worst case
 * bounded and observable, which is the honest goal for a design where the
 * position genuinely is off-chain.
 */
contract LemonVault is ERC4626, AccessControl, Pausable, IERC7540Redeem {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // -----------------------------------------------------------------------
    // Roles
    // -----------------------------------------------------------------------

    /// @notice The vault's agent. Moves capital and reports NAV; cannot choose a recipient.
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    /// @notice Can pause, and can fulfil redemptions if the agent goes dark.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;

    /**
     * @dev ERC-7540 permits a vault whose requests are fungible to use a single
     *      request id. Ours are: a user's queued shares are interchangeable, and
     *      the agent unwinds the book rather than any particular request, so
     *      per-request ids would be bookkeeping with no consumer.
     */
    uint256 public constant REQUEST_ID = 0;

    /// @dev ERC-165 id for the ERC-7540 asynchronous-redeem interface.
    bytes4 internal constant ERC7540_REDEEM_INTERFACE_ID = 0x620ee8e4;

    /// @dev Ceilings on configurable parameters, so a compromised admin key is bounded too.
    uint16 public constant MAX_MANAGEMENT_FEE_BPS = 500; // 5%/yr
    uint16 public constant MAX_PERFORMANCE_FEE_BPS = 3000; // 30%
    uint32 public constant MAX_REDEEM_DELAY = 30 days;

    /**
     * @dev Ceilings on the *agent* bounds, so loosening them is not a way round them.
     *
     * `setLimits` is the admin's, and the admin can grant itself `AGENT_ROLE`.
     * Without these, one transaction could set the per-report bound to 100%, the
     * epoch to a second and the redemption delay to zero — and the NAV bounds
     * that are the whole trust boundary would be gone before anyone read the
     * event. These are what keep "slow and visible" true of a compromised admin
     * key and not only of a compromised agent key.
     *
     * They are set well above every template the protocol ships (3-8% per
     * report, 15-35% per epoch), so they bind a hostile configuration rather
     * than an unusual market.
     */
    uint16 public constant MAX_NAV_DEVIATION_BPS = 2000; // 20% in one report
    uint16 public constant MAX_NAV_EPOCH_DEVIATION_BPS = 5000; // 50% in one epoch
    uint32 public constant MIN_NAV_EPOCH_DURATION = 1 hours;
    uint32 public constant MIN_REDEEM_DELAY = 1 days;

    /// @dev A buffer for the redemption queue always remains, whatever the admin sets.
    uint16 public constant MAX_DEPLOYED_BPS = 9500;

    /// @dev One times notional. Leverage is quoted in bps so 2.5x is expressible.
    uint32 public constant NO_LEVERAGE_BPS = 10_000;

    /// @dev The protocol ceiling. No vault may be created above 3x, whatever the tier.
    uint32 public constant MAX_LEVERAGE_BPS = 30_000;

    // -----------------------------------------------------------------------
    // Immutable identity
    // -----------------------------------------------------------------------

    /**
     * @notice How much risk this vault is mandated to take.
     *
     * `CONSERVATIVE` runs the basis unlevered: the perp short is fully
     * collateralised, so the position cannot be liquidated by a move in the
     * underlying and the yield is whatever funding pays on capital deployed
     * one-for-one. `LEVERAGED` runs the same trade at 2-3x, which multiplies
     * the funding yield and introduces a liquidation price.
     *
     * They are genuinely different products, not a slider — which is why the
     * choice is made once, at creation, and cannot be changed underneath the
     * people who deposited into it.
     */
    enum RiskTier {
        CONSERVATIVE,
        LEVERAGED
    }

    struct RiskProfile {
        RiskTier tier;
        /// What the agent aims for. 10_000 = 1x.
        uint32 targetLeverageBps;
        /// The hard ceiling. A NAV report above this is rejected outright.
        uint32 maxLeverageBps;
    }

    /// @notice The basis market this vault trades, e.g. `keccak256("NVDA")`.
    bytes32 public immutable marketId;

    /// @notice This vault's risk mandate. Immutable — see `RiskTier`.
    RiskTier public immutable riskTier;
    uint32 public immutable targetLeverageBps;
    uint32 public immutable maxLeverageBps;

    /// @notice Leverage the agent reported at its last NAV report.
    uint32 public lastObservedLeverageBps;

    /**
     * @notice The only address `agentWithdraw` can send USDC to.
     *
     * Immutable on purpose. If the agent could name its own recipient, every
     * other limit in this contract would only be slowing down a theft rather
     * than preventing one. Rotating the agent means deploying a new vault or —
     * for a key rotation against the same wallet — regranting `AGENT_ROLE`,
     * which cannot change where the money goes.
     */
    address public immutable agentWallet;

    /// @dev `10 ** decimals()`. One whole share, the unit price-per-share is quoted against.
    uint256 internal immutable PRICE_UNIT;

    /**
     * @dev `10 ** asset decimals`. One whole USDC, and the price a share starts at.
     *
     * Kept as its own constant rather than derived from `_convertToAssets` on an
     * empty vault. That expression reads 1:1 only while the vault holds nothing
     * at all — and a vault everyone has left still holds the rounding dust of
     * their exits, which the decimals offset would then multiply by 10**12 into
     * a high-water mark of several times par.
     */
    uint256 internal immutable ASSET_UNIT;

    // -----------------------------------------------------------------------
    // Accounting
    // -----------------------------------------------------------------------

    /**
     * @notice Value the agent reports as held outside this contract.
     *
     * Spot tokens on Base, Pacifica account equity, and USDC in flight between
     * them. Denominated in asset units (USDC, 6dp).
     *
     * This moves in exactly two ways: one-for-one with `agentWithdraw` /
     * `agentReturn`, which are real transfers, and via `reportNav`, which is the
     * agent's P&L claim and is the only unverifiable input in this contract.
     */
    uint256 public deployedAssets;

    /**
     * @notice USDC sitting here that is already spoken for by a fulfilled redemption.
     *
     * Excluded from `totalAssets` and from what the agent may withdraw. Without
     * it a fulfilled-but-unclaimed redemption would still be priced into the
     * share price, and the last claimant would find the money gone.
     */
    uint256 public claimableAssets;

    /// @notice Timestamp of the last accepted NAV report.
    uint64 public lastNavReportAt;

    /// @notice Timestamp fees were last accrued to.
    uint64 public lastFeeAccrualAt;

    /// @notice Start of the current NAV epoch, for the cumulative deviation bound.
    uint64 public navEpochStartedAt;

    /// @notice `deployedAssets` as at the start of the current epoch.
    uint256 public navEpochAnchor;

    /**
     * @notice Highest price-per-share ever reached, in asset units.
     *
     * The performance fee is charged only above this. A vault that loses 10%
     * and recovers it charges nothing on the recovery — users are not billed
     * twice for the same dollar.
     */
    uint256 public highWaterMarkPps;

    /// @notice Where fee shares are minted. All protocol profit accrues here.
    address public insuranceFund;

    // -----------------------------------------------------------------------
    // Redemption queue
    // -----------------------------------------------------------------------

    struct RedeemState {
        /// Escrowed here, awaiting the agent's unwind.
        uint256 pendingShares;
        /// Unwound and priced; awaiting the user's claim.
        uint256 claimableShares;
        /// Assets set aside for `claimableShares`.
        uint256 claimableAssets;
        /// When the pending bucket last changed. The delay is measured from here.
        uint64 requestedAt;
    }

    mapping(address controller => RedeemState) internal _redeem;
    mapping(address controller => mapping(address operator => bool)) public isOperator;

    /// @notice Total shares escrowed across all pending requests.
    uint256 public totalPendingRedeemShares;

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    struct Limits {
        /// Streaming management fee, bps per year. 200 = 2%.
        uint16 managementFeeBps;
        /// Performance fee above the high-water mark, bps. 2000 = 20%.
        uint16 performanceFeeBps;
        /// Shortest a request can sit before the agent may fulfil it.
        uint32 minRedeemDelay;
        /// The SLA the agent is held to. Surfaced in events and read by monitoring.
        uint32 maxRedeemDelay;
        /// Ceiling on `deployedAssets` as a fraction of `totalAssets`.
        uint16 maxDeployedBps;
        /// Largest single-report change in `deployedAssets`.
        uint16 maxNavDeviationBps;
        /// Largest change across one epoch, which is what bounds a slow drip.
        uint16 maxNavEpochDeviationBps;
        /// Length of that epoch.
        uint32 navEpochDuration;
        /// Rate limit on reporting, so the per-report bound cannot be spammed.
        uint32 minNavReportInterval;
        /// Beyond this the last report is not usable for pricing.
        uint32 maxNavStaleness;
        /// Rolling-window ceiling on agent withdrawals, in asset units.
        uint256 agentWithdrawWindowCap;
        uint32 agentWithdrawWindow;
    }

    Limits public limits;

    /// @notice When set, the agent may no longer take capital out; only return it.
    bool public emergencyExit;

    uint64 internal _agentWindowStartedAt;
    uint256 internal _agentWithdrawnInWindow;

    // -----------------------------------------------------------------------
    // Activity audit
    // -----------------------------------------------------------------------

    /**
     * @notice What the agent did.
     *
     * Deliberately wider than "a trade". Money moving between Base and Solana is
     * the step a depositor is least able to reconstruct from either chain alone
     * — funds leave one place and appear in another minutes later, and without
     * the two halves named as one action the gap reads as a loss. Bridges get
     * their own kinds for that reason, as does funding, which is the entire
     * reason the position exists and would otherwise show up only as NAV drift.
     */
    enum ActivityKind {
        SPOT_BUY,
        SPOT_SELL,
        PERP_OPEN,
        PERP_CLOSE,
        PERP_REBALANCE,
        BRIDGE_OUT,
        BRIDGE_IN,
        VENUE_DEPOSIT,
        VENUE_WITHDRAW,
        FUNDING_SETTLED
    }

    /// @notice The chains this system touches. EVM custody, Solana perps, NEAR signing.
    /// @dev Append only, and never reorder. These are emitted as their numeric index in
    ///      `ActivityReported`, and the indexer decodes them positionally — so inserting
    ///      ARBITRUM at position 1 would silently relabel every historical Solana fill on
    ///      every vault already deployed. New chains go on the end, where an old vault's
    ///      events keep meaning exactly what they meant when they were emitted.
    enum Chain {
        BASE,
        SOLANA,
        NEAR,
        ARBITRUM,
        XLAYER
    }

    struct ActivityReport {
        ActivityKind kind;
        Chain chain;
        bytes32 symbol;
        uint256 baseAmount;
        uint256 notionalAssets;
        /// Signed realised P&L, for closes and funding. Zero for pure movement.
        int256 pnlAssets;
        uint256 feeAssets;
        /// 32 bytes on an EVM chain, 64 for a Solana signature. Hence `bytes`.
        bytes txRef;
        /// When it happened at the venue, not when it was reported here.
        uint64 occurredAt;
    }

    uint256 public activityCount;
    uint256 public cumulativeNotional;
    uint256 public cumulativeVenueFees;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event NavReported(
        uint256 deployedAssets,
        uint256 totalAssets,
        uint256 pricePerShare,
        uint32 leverageBps,
        uint64 observedAt
    );
    event AgentWithdrew(uint256 amount, uint256 deployedAssets);
    event AgentReturned(uint256 amount, uint256 deployedAssets);
    event Donated(address indexed from, uint256 amount, uint256 totalAssets);
    event ActivityReported(
        uint256 indexed sequence,
        ActivityKind indexed kind,
        Chain chain,
        bytes32 indexed symbol,
        uint256 baseAmount,
        uint256 notionalAssets,
        int256 pnlAssets,
        uint256 feeAssets,
        bytes txRef,
        uint64 occurredAt
    );
    event RedeemQueued(address indexed controller, uint256 shares, uint64 eligibleAt, uint64 fulfillBy);
    event RedeemFulfilled(address indexed controller, uint256 shares, uint256 assets);
    event RedeemClaimed(address indexed controller, address indexed receiver, uint256 shares, uint256 assets);
    event FeesAccrued(uint256 managementShares, uint256 performanceShares, uint256 newHighWaterMark);
    event LimitsUpdated(Limits limits);
    event InsuranceFundUpdated(address indexed insuranceFund);
    event EmergencyExitSet(bool enabled);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error NotAuthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidLimits();
    error NavStale();
    error NavReportTooSoon();
    error NavDeviationTooLarge(uint256 proposed, uint256 bound);
    error NavEpochDeviationTooLarge(uint256 proposed, uint256 bound);
    error CannotReportNavWithNothingDeployed();
    error InsufficientFreeAssets(uint256 requested, uint256 available);
    error DeployedCeilingExceeded(uint256 proposed, uint256 ceiling);
    error AgentWindowCapExceeded(uint256 requested, uint256 remaining);
    error AgentWithdrawalsDisabled();
    error RedeemDelayNotElapsed(uint64 eligibleAt);
    error ExceedsPendingRequest(uint256 requested, uint256 pending);
    error ExceedsClaimableRequest(uint256 requested, uint256 claimable);
    error AsyncRedemptionOnly();
    error InvalidRiskProfile();
    error LeverageExceedsMandate(uint32 observed, uint32 ceiling);

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    struct InitParams {
        IERC20 asset;
        string name;
        string symbol;
        bytes32 marketId;
        address admin;
        address agentWallet;
        address guardian;
        address insuranceFund;
        RiskProfile risk;
        Limits limits;
    }

    constructor(InitParams memory p) ERC20(p.name, p.symbol) ERC4626(p.asset) {
        if (
            p.admin == address(0) || p.agentWallet == address(0) || p.guardian == address(0)
                || p.insuranceFund == address(0)
        ) revert ZeroAddress();

        marketId = p.marketId;
        agentWallet = p.agentWallet;
        insuranceFund = p.insuranceFund;

        _validateRiskProfile(p.risk);
        riskTier = p.risk.tier;
        targetLeverageBps = p.risk.targetLeverageBps;
        maxLeverageBps = p.risk.maxLeverageBps;
        lastObservedLeverageBps = p.risk.targetLeverageBps;

        _validateLimits(p.limits);
        limits = p.limits;

        _grantRole(DEFAULT_ADMIN_ROLE, p.admin);
        _grantRole(AGENT_ROLE, p.agentWallet);
        _grantRole(GUARDIAN_ROLE, p.guardian);
        _grantRole(GUARDIAN_ROLE, p.admin);

        PRICE_UNIT = 10 ** decimals();
        ASSET_UNIT = 10 ** (decimals() - _decimalsOffset());

        // One whole share for one whole USDC: the price the first depositor
        // gets. Seeding it here rather than on first accrual means there is no
        // window in which the mark is zero and every gain looks like profit
        // over nothing.
        highWaterMarkPps = ASSET_UNIT;

        lastFeeAccrualAt = uint64(block.timestamp);
        lastNavReportAt = uint64(block.timestamp);
        navEpochStartedAt = uint64(block.timestamp);
        _agentWindowStartedAt = uint64(block.timestamp);
    }

    /**
     * @dev Shares are 18dp against a 6dp asset.
     *
     * The offset is not cosmetic: it also sets the virtual share/asset ratio
     * that defends the first depositor against an inflation attack, where an
     * attacker mints one wei of shares and donates a large balance so the next
     * deposit rounds to zero shares. At 10**12 virtual shares that donation has
     * to be twelve orders of magnitude larger than the victim's deposit to
     * round anything off, which prices the attack out.
     */
    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }

    // -----------------------------------------------------------------------
    // Valuation
    // -----------------------------------------------------------------------

    /**
     * @notice Everything the vault is worth, in asset units.
     *
     * Idle USDC is read from the token, so it cannot be misreported. Deployed
     * capital is the agent's claim, bounded by `reportNav`. Assets already
     * earmarked for fulfilled redemptions are subtracted, because they belong
     * to a specific claimant rather than to the share price.
     */
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 gross = idle + deployedAssets;
        // Defensive: `claimableAssets` is only ever incremented against assets
        // verified present, so this cannot underflow in practice. Saturating
        // rather than reverting keeps a view function from bricking the vault.
        return gross > claimableAssets ? gross - claimableAssets : 0;
    }

    /// @notice USDC here that is neither spoken for nor deployed.
    function freeAssets() public view returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        return idle > claimableAssets ? idle - claimableAssets : 0;
    }

    /// @notice Assets per whole share, in asset units. 1e6 means one share is worth 1 USDC.
    function pricePerShare() public view returns (uint256) {
        return _convertToAssets(PRICE_UNIT, Math.Rounding.Floor);
    }

    /// @notice Whether the last NAV report is too old to price a deposit or a redemption against.
    function navIsStale() public view returns (bool) {
        return block.timestamp > uint256(lastNavReportAt) + limits.maxNavStaleness;
    }

    // -----------------------------------------------------------------------
    // Deposits — synchronous
    // -----------------------------------------------------------------------

    /**
     * @dev Zero when the vault cannot honestly price a deposit.
     *
     * Returning zero rather than reverting is what ERC-4626 asks for: callers
     * that check `maxDeposit` first get a clean answer, and `deposit` still
     * reverts with the standard `ERC4626ExceededMaxDeposit`.
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || navIsStale()) return 0;
        return type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        if (paused() || navIsStale()) return 0;
        return type(uint256).max;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        _accrueFees();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override returns (uint256) {
        _accrueFees();
        return super.mint(shares, receiver);
    }

    // -----------------------------------------------------------------------
    // Redemptions — asynchronous (ERC-7540)
    // -----------------------------------------------------------------------

    function setOperator(address operator, bool approved) external returns (bool) {
        if (operator == address(0)) revert ZeroAddress();
        isOperator[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
        return true;
    }

    /**
     * @notice Queue `shares` for redemption.
     *
     * The shares move into escrow but stay part of `totalSupply`, so the
     * requester keeps full exposure to the position until it is actually
     * unwound. That is the honest arrangement: the agent is closing a leveraged
     * hedge over days, and pricing the exit at request time would hand the
     * requester a free option on everyone else's capital.
     *
     * @dev Adding to a pending bucket restarts its delay. Requests are merged
     *      under one id, so the alternative — keeping the earliest timestamp —
     *      would let a one-wei request ripen for three days and then carry an
     *      arbitrarily large top-up out with it immediately.
     */
    function requestRedeem(uint256 shares, address controller, address owner) external returns (uint256) {
        if (shares == 0) revert ZeroAmount();
        if (owner != msg.sender && !isOperator[owner][msg.sender]) revert NotAuthorized();
        // Writing into someone else's bucket would let a stranger restart their
        // delay with dust, so a foreign controller requires their authorisation.
        if (controller != owner && !isOperator[controller][msg.sender]) revert NotAuthorized();

        _accrueFees();

        _transfer(owner, address(this), shares);

        RedeemState storage r = _redeem[controller];
        r.pendingShares += shares;
        r.requestedAt = uint64(block.timestamp);
        totalPendingRedeemShares += shares;

        emit RedeemRequest(controller, owner, REQUEST_ID, msg.sender, shares);
        emit RedeemQueued(
            controller,
            shares,
            uint64(block.timestamp + limits.minRedeemDelay),
            uint64(block.timestamp + limits.maxRedeemDelay)
        );
        return REQUEST_ID;
    }

    function pendingRedeemRequest(uint256, address controller) external view returns (uint256) {
        return _redeem[controller].pendingShares;
    }

    function claimableRedeemRequest(uint256, address controller) external view returns (uint256) {
        return _redeem[controller].claimableShares;
    }

    /// @notice Full queue state for one controller, for the UI's withdrawal card.
    function redeemStateOf(address controller)
        external
        view
        returns (
            uint256 pendingShares,
            uint256 pendingClaimableShares,
            uint256 pendingClaimableAssets,
            uint64 requestedAt,
            uint64 eligibleAt,
            uint64 fulfillBy
        )
    {
        RedeemState storage r = _redeem[controller];
        return (
            r.pendingShares,
            r.claimableShares,
            r.claimableAssets,
            r.requestedAt,
            r.requestedAt == 0 ? 0 : r.requestedAt + limits.minRedeemDelay,
            r.requestedAt == 0 ? 0 : r.requestedAt + limits.maxRedeemDelay
        );
    }

    /**
     * @notice Price a queued redemption and set its assets aside.
     *
     * The caller supplies only *which* request and *how many* shares. The price
     * is this contract's, computed from the current share price — the agent
     * never names the amount. That removes a second unbounded trust surface:
     * the NAV report is already limited, and letting the agent also choose the
     * payout would have made those limits bypassable one redemption at a time.
     *
     * Requires assets to already be here, so the agent must have unwound and
     * called `agentReturn` first.
     */
    function fulfillRedeem(address controller, uint256 shares) external returns (uint256 assets) {
        bool isAgent = hasRole(AGENT_ROLE, msg.sender);
        bool isGuardian = hasRole(GUARDIAN_ROLE, msg.sender);
        if (!isAgent && !isGuardian) revert NotAuthorized();

        // Pricing an exit against a stale NAV is guesswork. The exception is a
        // guardian working an emergency exit, where a stale price beats funds
        // that cannot leave at all — the agent is by then assumed gone.
        if (navIsStale() && !(isGuardian && emergencyExit)) revert NavStale();

        _accrueFees();

        RedeemState storage r = _redeem[controller];
        if (shares == 0) revert ZeroAmount();
        if (shares > r.pendingShares) revert ExceedsPendingRequest(shares, r.pendingShares);

        uint64 eligibleAt = r.requestedAt + limits.minRedeemDelay;
        if (block.timestamp < eligibleAt) revert RedeemDelayNotElapsed(eligibleAt);

        assets = _convertToAssets(shares, Math.Rounding.Floor);

        uint256 available = freeAssets();
        if (assets > available) revert InsufficientFreeAssets(assets, available);

        r.pendingShares -= shares;
        r.claimableShares += shares;
        r.claimableAssets += assets;
        totalPendingRedeemShares -= shares;
        claimableAssets += assets;

        // Burning here, not at claim time, is what makes the share price correct
        // for everyone still in: the redeemer's exposure ends the moment their
        // exit is priced.
        _burn(address(this), shares);

        emit RedeemFulfilled(controller, shares, assets);
    }

    /**
     * @dev ERC-7540 redefines these as the *claimable* amounts rather than what
     *      the holder could theoretically exit — a balance that is not yet
     *      through the queue is not withdrawable at all.
     */
    function maxRedeem(address controller) public view override returns (uint256) {
        return _redeem[controller].claimableShares;
    }

    function maxWithdraw(address controller) public view override returns (uint256) {
        return _redeem[controller].claimableAssets;
    }

    /**
     * @dev ERC-7540 requires the synchronous previews to revert. A preview
     *      implies a price available now; this vault's exit price is fixed at
     *      fulfilment, days later, and returning today's number would be a
     *      quote the contract has no intention of honouring.
     */
    function previewRedeem(uint256) public pure override returns (uint256) {
        revert AsyncRedemptionOnly();
    }

    function previewWithdraw(uint256) public pure override returns (uint256) {
        revert AsyncRedemptionOnly();
    }

    /// @notice Claim assets for shares already fulfilled.
    function redeem(uint256 shares, address receiver, address controller)
        public
        override
        returns (uint256 assets)
    {
        _assertCanClaim(controller);
        RedeemState storage r = _redeem[controller];
        if (shares == 0) revert ZeroAmount();
        if (shares > r.claimableShares) revert ExceedsClaimableRequest(shares, r.claimableShares);

        assets = shares.mulDiv(r.claimableAssets, r.claimableShares, Math.Rounding.Floor);
        _claim(r, controller, receiver, shares, assets);
    }

    /// @notice Claim a specific asset amount from a fulfilled request.
    function withdraw(uint256 assets, address receiver, address controller)
        public
        override
        returns (uint256 shares)
    {
        _assertCanClaim(controller);
        RedeemState storage r = _redeem[controller];
        if (assets == 0) revert ZeroAmount();
        if (assets > r.claimableAssets) revert ExceedsClaimableRequest(assets, r.claimableAssets);

        shares = assets.mulDiv(r.claimableShares, r.claimableAssets, Math.Rounding.Ceil);
        if (shares > r.claimableShares) shares = r.claimableShares;
        _claim(r, controller, receiver, shares, assets);
    }

    function _assertCanClaim(address controller) internal view {
        if (msg.sender != controller && !isOperator[controller][msg.sender]) revert NotAuthorized();
    }

    function _claim(
        RedeemState storage r,
        address controller,
        address receiver,
        uint256 shares,
        uint256 assets
    ) internal {
        if (receiver == address(0)) revert ZeroAddress();

        r.claimableShares -= shares;
        r.claimableAssets -= assets;
        claimableAssets -= assets;

        IERC20(asset()).safeTransfer(receiver, assets);

        emit RedeemClaimed(controller, receiver, shares, assets);
        emit Withdraw(msg.sender, receiver, controller, assets, shares);
    }

    // -----------------------------------------------------------------------
    // Agent — capital movement
    // -----------------------------------------------------------------------

    /**
     * @notice Move idle USDC to the agent so it can open the position.
     *
     * `deployedAssets` rises by exactly the amount that left, so the share price
     * does not move: this is a change of location, not of value. Every claim
     * about value comes later, through `reportNav`.
     */
    function agentWithdraw(uint256 amount) external onlyRole(AGENT_ROLE) whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (emergencyExit) revert AgentWithdrawalsDisabled();
        if (navIsStale()) revert NavStale();

        uint256 available = freeAssets();
        if (amount > available) revert InsufficientFreeAssets(amount, available);

        // Keep a buffer here. Without it a vault can be fully deployed at the
        // moment a redemption ripens, and the queue stalls on an unwind that
        // could have been avoided.
        uint256 ceiling = totalAssets().mulDiv(limits.maxDeployedBps, BPS, Math.Rounding.Floor);
        if (deployedAssets + amount > ceiling) {
            revert DeployedCeilingExceeded(deployedAssets + amount, ceiling);
        }

        // A leaky bucket rather than a tumbling one. Resetting the counter
        // wholesale at a fixed boundary lets the agent draw the full cap in the
        // last second of one window and the full cap again in the first second
        // of the next — twice the stated limit, back to back, which is exactly
        // the burst the cap exists to prevent. Decaying the counter in
        // proportion to elapsed time refills the allowance at cap/window, so no
        // interval of one window's length can carry more than the cap.
        uint256 window = limits.agentWithdrawWindow;
        uint256 elapsed = block.timestamp - uint256(_agentWindowStartedAt);
        uint256 drawn = _agentWithdrawnInWindow;
        if (elapsed >= window) {
            drawn = 0;
        } else if (elapsed > 0) {
            drawn -= drawn.mulDiv(elapsed, window, Math.Rounding.Floor);
        }
        _agentWindowStartedAt = uint64(block.timestamp);

        uint256 remaining =
            limits.agentWithdrawWindowCap > drawn ? limits.agentWithdrawWindowCap - drawn : 0;
        if (amount > remaining) revert AgentWindowCapExceeded(amount, remaining);
        _agentWithdrawnInWindow = drawn + amount;

        deployedAssets += amount;
        // The epoch bound exists to limit the agent's *P&L claim*, so capital
        // that merely moved has to move the anchor with it. Without this, a
        // vault that deploys twice in one epoch would find its second, entirely
        // legitimate NAV report rejected as an implausible gain.
        navEpochAnchor += amount;
        IERC20(asset()).safeTransfer(agentWallet, amount);

        emit AgentWithdrew(amount, deployedAssets);
    }

    /**
     * @notice Return USDC from the agent to the vault.
     *
     * Deliberately callable by anyone. Returning capital can only help the
     * vault, and a hard requirement that the sender hold `AGENT_ROLE` would mean
     * a rotated or revoked key could not hand the money back.
     *
     * Returning more than is deployed is allowed and floors `deployedAssets` at
     * zero — that is a fully unwound position that made a profit, and the excess
     * simply becomes idle assets.
     */
    function agentReturn(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        uint256 credited = amount < deployedAssets ? amount : deployedAssets;
        deployedAssets -= credited;

        // Mirrors `agentWithdraw`: returned capital is not a loss, so the epoch
        // anchor follows it down rather than leaving the agent's remaining
        // position looking like it lost everything that was handed back.
        navEpochAnchor = navEpochAnchor > credited ? navEpochAnchor - credited : 0;

        emit AgentReturned(amount, deployedAssets);
    }

    /**
     * @notice Add USDC to the vault with nothing minted against it.
     *
     * This is the insurance fund's shortfall cover, and the only operation that
     * genuinely raises the share price for the holders who are still in.
     *
     * It is deliberately *not* `agentReturn`. That call credits capital the
     * agent was already holding, so it lowers `deployedAssets` by the same
     * amount it adds in idle USDC and leaves `totalAssets` — and therefore the
     * share price — exactly where it was. Routing a donation through it would
     * spend the fund's money for no benefit to anyone, write the live position
     * down by the size of the gift, and then book that gap back as a fabricated
     * gain at the agent's next honest report.
     *
     * Callable by anyone, for the same reason `agentReturn` is: money coming in
     * can only help the vault, and gating it on a key means a rotated or lost
     * key cannot make depositors whole.
     */
    function donate(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        // Settle everything owed up to now *first*, against the pre-donation
        // valuation. Fees are the price of time already elapsed, and the gift
        // is not part of it.
        _accrueFees();

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        // Then carry the high-water mark over the donation. A gift is not
        // performance: without this the price rise it causes reads as a gain
        // and the operator is paid a 20% performance fee out of the very
        // capital it just contributed to cover a loss.
        uint256 pps = pricePerShare();
        if (pps > highWaterMarkPps) highWaterMarkPps = pps;

        emit Donated(msg.sender, amount, totalAssets());
    }

    // -----------------------------------------------------------------------
    // Agent — reporting
    // -----------------------------------------------------------------------

    /**
     * @notice Restate what the off-chain position is worth.
     *
     * Bounded three ways. Per report, so one call cannot reprice the vault.
     * Per epoch, so a sequence of small reports cannot do slowly what one call
     * may not do at once. And by interval, so the per-report bound cannot be
     * spent faster than the epoch bound anticipates.
     *
     * @param newDeployedAssets Total value held outside the vault, in asset units.
     * @param observedAt When the agent read the venues. Recorded for the indexer;
     *        freshness is judged on block time, which the agent cannot influence.
     */
    function reportNav(uint256 newDeployedAssets, uint32 observedLeverageBps, uint64 observedAt)
        external
        onlyRole(AGENT_ROLE)
    {
        if (block.timestamp < uint256(lastNavReportAt) + limits.minNavReportInterval) {
            revert NavReportTooSoon();
        }

        // The mandate, made enforceable. The chain cannot see the perp account,
        // but it can refuse to accept a report that admits to breaching the
        // mandate — so an agent running 3x in an unlevered vault has to either
        // stop reporting, which stales the vault and blocks its own deposits and
        // withdrawals, or state a leverage the contract rejects. Neither is a
        // quiet failure, which is the most this layer can honestly promise.
        if (observedLeverageBps > maxLeverageBps) {
            revert LeverageExceedsMandate(observedLeverageBps, maxLeverageBps);
        }

        uint256 current = deployedAssets;

        // Nothing has left the vault, so there is nothing out there to have
        // gained or lost. Without this, a vault that has never deployed would
        // accept any number at all — the deviation bound is a percentage, and
        // every percentage of zero is zero.
        if (current == 0) {
            if (newDeployedAssets != 0) revert CannotReportNavWithNothingDeployed();
        } else {
            uint256 bound = current.mulDiv(limits.maxNavDeviationBps, BPS, Math.Rounding.Floor);
            uint256 delta =
                newDeployedAssets > current ? newDeployedAssets - current : current - newDeployedAssets;
            if (delta > bound) revert NavDeviationTooLarge(delta, bound);
        }

        if (block.timestamp >= uint256(navEpochStartedAt) + limits.navEpochDuration) {
            navEpochStartedAt = uint64(block.timestamp);
            navEpochAnchor = current;
        }

        // An anchor of zero is no bound at all, since every percentage of zero
        // is zero. That is safe here only because `agentWithdraw` moves the
        // anchor with the capital: `deployedAssets` cannot become non-zero
        // without the anchor doing so in the same call, so a zero anchor means
        // there is genuinely nothing deployed to have gained or lost — a case
        // the per-report check above has already rejected.
        uint256 anchor = navEpochAnchor;
        if (anchor != 0) {
            uint256 epochBound = anchor.mulDiv(limits.maxNavEpochDeviationBps, BPS, Math.Rounding.Floor);
            uint256 epochDelta =
                newDeployedAssets > anchor ? newDeployedAssets - anchor : anchor - newDeployedAssets;
            if (epochDelta > epochBound) revert NavEpochDeviationTooLarge(epochDelta, epochBound);
        }

        // Accrue against the *old* valuation first. Fees are the price of the
        // time already elapsed; charging them on a gain reported in the same
        // call would bill this period's management fee on next period's assets.
        _accrueFees();

        deployedAssets = newDeployedAssets;
        lastObservedLeverageBps = observedLeverageBps;
        lastNavReportAt = uint64(block.timestamp);

        // Then again, so the performance fee sees the gain it is owed on.
        _accrueFees();

        emit NavReported(newDeployedAssets, totalAssets(), pricePerShare(), observedLeverageBps, observedAt);
    }

    /**
     * @notice Record something the agent did, wherever it did it.
     *
     * Pure audit: this moves no value and feeds no price. It exists because the
     * position is invisible from this chain, and a vault whose activity can only
     * be seen in the operator's own database is not a vault anyone can check.
     * Every one of these becomes a row in the public per-vault activity feed.
     *
     * These are **attestations, not proofs**. Nothing here is verified on-chain,
     * and it cannot be: Base cannot read a Pacifica fill. What makes them useful
     * anyway is `txRef` — a real transaction identifier on a public chain. An
     * indexer can fetch each one from the chain it names and check that it
     * exists, that it moved what this claims, and that it involved the agent's
     * own wallet. So a false report is not merely unproven; it is refutable by
     * anyone, permanently, against a record the operator cannot edit.
     *
     */
    function reportActivity(ActivityReport calldata report) external onlyRole(AGENT_ROLE) {
        _recordActivity(report);
    }

    /**
     * @notice Report several actions in one transaction.
     *
     * One deployment is a spot buy, a bridge out, a venue deposit and a perp
     * open — four rows describing a single decision. Batching keeps them in one
     * block, so the feed cannot show a bridge with no arrival because the second
     * report ran out of gas.
     */
    function reportActivityBatch(ActivityReport[] calldata reports) external onlyRole(AGENT_ROLE) {
        for (uint256 i = 0; i < reports.length; i++) {
            _recordActivity(reports[i]);
        }
    }

    function _recordActivity(ActivityReport calldata r) internal {
        uint256 sequence = ++activityCount;
        cumulativeNotional += r.notionalAssets;
        cumulativeVenueFees += r.feeAssets;
        emit ActivityReported(
            sequence,
            r.kind,
            r.chain,
            r.symbol,
            r.baseAmount,
            r.notionalAssets,
            r.pnlAssets,
            r.feeAssets,
            r.txRef,
            r.occurredAt
        );
    }

    // -----------------------------------------------------------------------
    // Fees
    // -----------------------------------------------------------------------

    /**
     * @notice Bring fees up to date.
     *
     * Management first: it is rent on assets under management and reduces the
     * share price, so charging it before the performance fee stops the operator
     * being paid a performance fee on assets it is about to take as rent.
     *
     * Both are taken as newly minted shares rather than as a transfer of USDC.
     * The vault is usually deployed, so there is often no USDC here to pay with
     * — and diluting is what makes the fee come out of the gain rather than out
     * of the working capital of the position.
     */
    function _accrueFees() internal {
        uint256 elapsed = block.timestamp - lastFeeAccrualAt;
        lastFeeAccrualAt = uint64(block.timestamp);

        uint256 supply = totalSupply();
        if (supply == 0) {
            // No holders to dilute and no capital to charge rent on. Reset the
            // mark to par so the first depositor after an empty period is
            // neither billed for a peak reached by a cohort that has already
            // left, nor handed a mark inflated by the dust those exits left
            // behind — which would disable the performance fee indefinitely.
            highWaterMarkPps = ASSET_UNIT;
            return;
        }

        uint256 managementShares;
        uint256 performanceShares;
        Limits memory l = limits;

        if (elapsed > 0 && l.managementFeeBps > 0) {
            uint256 feeAssets =
                totalAssets().mulDiv(uint256(l.managementFeeBps) * elapsed, BPS * YEAR, Math.Rounding.Floor);
            managementShares = _mintFeeShares(feeAssets);
        }

        if (l.performanceFeeBps > 0) {
            uint256 pps = pricePerShare();
            uint256 mark = highWaterMarkPps;
            if (pps > mark) {
                uint256 gainAssets = (pps - mark).mulDiv(totalSupply(), PRICE_UNIT, Math.Rounding.Floor);
                uint256 feeAssets = gainAssets.mulDiv(l.performanceFeeBps, BPS, Math.Rounding.Floor);
                performanceShares = _mintFeeShares(feeAssets);
                // Re-read: the mint just diluted the price, and marking the
                // pre-dilution peak would charge the same gain again next time
                // the price merely recovers to it.
                highWaterMarkPps = pricePerShare();
            }
        }

        if (managementShares > 0 || performanceShares > 0) {
            emit FeesAccrued(managementShares, performanceShares, highWaterMarkPps);
        }
    }

    /**
     * @dev Mint the fee as shares worth exactly `feeAssets` once minted.
     *
     * The obvious implementation — `_convertToShares(feeAssets)` — prices the
     * shares before they exist, and the mint then dilutes the very pool that
     * pays them. On a 2% annual fee that lands at about 1.96%, which is a
     * schedule nobody agreed to: the number in the docs and the number charged
     * have to be the same number.
     *
     * Solving for the post-dilution value instead:
     *
     *     shares / (supply + shares) = feeAssets / assets
     *     shares                     = feeAssets * supply / (assets - feeAssets)
     *
     * `supply` carries the virtual shares so this stays consistent with the
     * conversion maths everywhere else.
     */
    function _mintFeeShares(uint256 feeAssets) internal returns (uint256 shares) {
        if (feeAssets == 0) return 0;

        uint256 assets = totalAssets();
        // A fee at or above the whole vault is not a fee. It can only come from
        // a misconfiguration or an accrual over an absurd elapsed time, and the
        // formula's denominator would be zero or negative. Charging nothing is
        // the safe reading.
        if (assets == 0 || feeAssets >= assets) return 0;

        uint256 supply = totalSupply() + 10 ** _decimalsOffset();
        shares = feeAssets.mulDiv(supply, assets - feeAssets, Math.Rounding.Floor);
        if (shares == 0) return 0;
        _mint(insuranceFund, shares);
    }

    /// @notice Accrue fees without any other state change. Callable by anyone.
    function accrueFees() external {
        _accrueFees();
    }

    // -----------------------------------------------------------------------
    // Administration
    // -----------------------------------------------------------------------

    function setLimits(Limits calldata next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _accrueFees();
        _validateLimits(next);
        limits = next;
        emit LimitsUpdated(next);
    }

    function setInsuranceFund(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        _accrueFees();
        insuranceFund = next;
        emit InsuranceFundUpdated(next);
    }

    /// @notice Stop the agent taking any more capital out. One-way by design.
    function setEmergencyExit(bool enabled) external onlyRole(GUARDIAN_ROLE) {
        emergencyExit = enabled;
        emit EmergencyExitSet(enabled);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev The two tiers are checked against different rules on purpose.
     *
     * "Conservative" has to mean something specific, or it is marketing. Here it
     * means exactly 1x with no headroom: a target and a ceiling that are both
     * `NO_LEVERAGE_BPS`, so there is no configuration in which such a vault
     * carries a liquidation price.
     */
    function _validateRiskProfile(RiskProfile memory r) internal pure {
        if (r.maxLeverageBps < r.targetLeverageBps) revert InvalidRiskProfile();
        if (r.maxLeverageBps > MAX_LEVERAGE_BPS) revert InvalidRiskProfile();

        if (r.tier == RiskTier.CONSERVATIVE) {
            if (r.targetLeverageBps != NO_LEVERAGE_BPS) revert InvalidRiskProfile();
            if (r.maxLeverageBps != NO_LEVERAGE_BPS) revert InvalidRiskProfile();
        } else {
            // A "leveraged" vault that is allowed to sit at 1x is the
            // conservative product wearing the riskier label, and its depositors
            // would be paying a performance fee for a mandate it never runs.
            if (r.targetLeverageBps <= NO_LEVERAGE_BPS) revert InvalidRiskProfile();
        }
    }

    function _validateLimits(Limits memory l) internal pure {
        if (l.managementFeeBps > MAX_MANAGEMENT_FEE_BPS) revert InvalidLimits();
        if (l.performanceFeeBps > MAX_PERFORMANCE_FEE_BPS) revert InvalidLimits();
        // A queue that can be set to no queue is not a queue. Zero here would
        // let whoever inflated the share price convert the result to cash in
        // the same block.
        if (l.minRedeemDelay < MIN_REDEEM_DELAY) revert InvalidLimits();
        if (l.minRedeemDelay > l.maxRedeemDelay) revert InvalidLimits();
        if (l.maxRedeemDelay > MAX_REDEEM_DELAY) revert InvalidLimits();
        if (l.maxDeployedBps > MAX_DEPLOYED_BPS) revert InvalidLimits();
        if (l.maxNavDeviationBps > MAX_NAV_DEVIATION_BPS) revert InvalidLimits();
        if (l.maxNavEpochDeviationBps > MAX_NAV_EPOCH_DEVIATION_BPS) revert InvalidLimits();
        // An epoch bound looser than the per-report bound is not a bound at all.
        if (l.maxNavEpochDeviationBps < l.maxNavDeviationBps) revert InvalidLimits();
        // An epoch short enough to reset every block is not a bound either: the
        // anchor re-reads `deployedAssets` on rollover, so a one-second epoch
        // turns the cumulative bound back into the per-report one, compounding.
        if (l.navEpochDuration < MIN_NAV_EPOCH_DURATION) revert InvalidLimits();
        if (l.maxNavStaleness == 0) revert InvalidLimits();
        // Staleness has to outlast the reporting rate limit, or the agent is
        // forbidden from reporting until after the vault has already frozen —
        // which blocks deposits and fulfilments with no way back.
        if (l.maxNavStaleness <= l.minNavReportInterval) revert InvalidLimits();
        if (l.agentWithdrawWindow == 0) revert InvalidLimits();
    }

    // -----------------------------------------------------------------------
    // Introspection
    // -----------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return interfaceId == ERC7540_REDEEM_INTERFACE_ID || super.supportsInterface(interfaceId);
    }
}
