// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./PositionToken.sol";
import "./interfaces/AggregatorV3Interface.sol";

contract SpeculateCore is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ==========================
    // Config / Roles / Constants
    // ==========================
    IERC20 public immutable usdc;
    address public treasury;
    address public chainlinkResolver;
    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR_ROLE");
    uint256 public constant USDC_TO_E18 = 1e12; // 6 -> 18
    uint256 public constant MAX_USDC_PER_TRADE = 100_000e6;
    uint256 public constant MIN_MARKET_SEED = 10e6; // Minimum USDC to create market
    uint256 public constant MIN_LIQUIDITY_ADD = 10e6; // Minimum USDC to add liquidity
    uint256 public constant DUST_THRESHOLD = 100; // Minimum tokens to avoid dust
    uint256 public constant ORACLE_STALENESS_THRESHOLD = 3600; // 1 hour in seconds
    uint256 public constant PRICE_DECIMALS_E6 = 1e6; // 1 USDC in 6 decimals
    uint256 public constant PRICE_DECIMALS_E18 = 1e18; // 1 unit in 18 decimals
    uint256 private constant BPS_DENOMINATOR = 10_000; // Basis points denominator (100%)
    uint256 public liquidityMultiplierE18 = 1e18; // lowered default for steeper curve (faster price changes, better backing)
    /// @notice Global default per-tx price jump cap (e.g., 0.15 = 15 percentage points)
    uint256 public maxInstantJumpE18 = 15e16; // 0.15 * 1e18
    /// @notice Fee caps (bps). Total cap and per-leg cap.
    uint16 public constant MAX_FEE_BPS_TOTAL = 300; // 3.00%
    uint16 public constant MAX_FEE_BPS_PER = 200;   // 2.00% per leg

    // ===============
    // Market & Oracle
    // ===============
    enum MarketStatus { Active, Resolved }
    enum OracleType { None, ChainlinkFeed }
    enum Comparison { Above, Below, Equals }
    struct ResolutionConfig {
        uint256 expiryTimestamp;
        OracleType oracleType;
        address oracleAddress;
        bytes32 priceFeedId; // optional, for off-chain tooling
        uint256 targetValue;
        Comparison comparison;
        bool yesWins;
        bool isResolved;
    }
    struct Market {
        // tokens & LMSR state
        PositionToken yes;
        PositionToken no;
        uint256 qYes;
        uint256 qNo;
        uint256 bE18; // constant LMSR liquidity parameter
        // vault & fees
        uint256 usdcVault; // trading float + redemption pot
        uint16 feeTreasuryBps; // e.g., 100 = 1.00%
        uint16 feeVaultBps; // e.g., 0 = 0.00%
        uint16 feeLpBps; // e.g., 100 = 1.00%
        // status & meta
        MarketStatus status;
        string question;
        address lp; // market creator (for metadata)
        ResolutionConfig resolution;
        // LP accounting
        uint256 totalLpUsdc; // sum of lpShares[..]
        uint256 lpFeesUSDC; // pot of LP trading fees (tracked & bounded)
        // trade caps / jump bands
        uint256 maxUsdcPerTrade; // 0 => fallback to global MAX_USDC_PER_TRADE
        uint256 priceBandThreshold; // enable jump cap when vault < this (e6); 0 = always enforce
        uint256 maxJumpE18; // per-market delta cap; 0 => use global maxInstantJumpE18
    }

    // ===========
    // Storage
    // ===========
    mapping(uint256 => Market) public markets;
    uint256 public marketCount;
    // LP shares & fee indexing (MasterChef-style)
    mapping(uint256 => mapping(address => uint256)) public lpShares; // id -> user -> USDC shares
    mapping(uint256 => uint256) public accFeePerUSDCE18; // id -> accum trading fee index (1e18)
    mapping(uint256 => mapping(address => uint256)) public lpFeeDebt; // id -> user -> realized index * shares
    // Residual (post-resolution) indexing
    mapping(uint256 => uint256) public accResidualPerUSDCE18; // id -> accum residual index (1e18)
    mapping(uint256 => mapping(address => uint256)) public lpResidualDebt; // id -> user -> realized residual
    mapping(uint256 => uint256) public lpResidualUSDC; // id -> pot of finalized residual USDC

    // ===========
    // Math const
    // ===========
    uint256 private constant SCALE = 1e18;
    uint256 private constant LN2 = 693_147_180_559_945_309;
    uint256 private constant LOG2_E = 1_442_695_040_888_963_407;
    uint256 private constant TWO_OVER_LN2 = (2 * SCALE * SCALE) / LN2;

    // ===========
    // Events / Errors
    // ===========
    event MarketCreated(
        uint256 indexed id,
        address yes,
        address no,
        string question,
        uint256 initUsdc,
        uint256 expiryTimestamp
    );
    event Buy(uint256 indexed id, address indexed user, bool isYes, uint256 usdcIn, uint256 tokensOut, uint256 priceE6);
    event Sell(uint256 indexed id, address indexed user, bool isYes, uint256 tokensIn, uint256 usdcOut, uint256 priceE6);
    event Redeemed(uint256 indexed id, address indexed user, uint256 usdcOut);
    event MarketResolved(uint256 indexed id, bool yesWins);
    event LiquidityAdded(uint256 indexed id, address indexed lp, uint256 usdcAdd);
    event LiquidityParameterUpdated(uint256 indexed id, uint256 newBE18, uint256 totalLpUsdc);
    event LpFeesClaimed(uint256 indexed id, address indexed lp, uint256 amount);
    event ResidualFinalized(uint256 indexed id, uint256 amountIndexed, uint256 totalLp);
    event LpResidualClaimed(uint256 indexed id, address indexed lp, uint256 amount);
    event DustSwept(uint256 indexed id, address indexed to, uint256 amount);
    event VaultTopUp(uint256 indexed id, uint256 amount);
    event FeesUpdated(uint256 indexed id, uint16 feeTreasuryBps, uint16 feeVaultBps, uint16 feeLpBps);
    // Admin events for transparency
    event TreasurySet(address indexed oldTreasury, address indexed newTreasury);
    event ChainlinkResolverSet(address indexed oldResolver, address indexed newResolver);
    event LiquidityMultiplierSet(uint256 oldMultiplier, uint256 newMultiplier);
    event PriceFeedIdSet(uint256 indexed id, bytes32 oldFeedId, bytes32 newFeedId);
    event MaxUsdcPerTradeSet(uint256 indexed id, uint256 oldMax, uint256 newMax);
    event PriceBandThresholdSet(uint256 indexed id, uint256 oldThreshold, uint256 newThreshold);
    event MaxInstantJumpSet(uint256 oldJump, uint256 newJump);
    event MarketMaxInstantJumpSet(uint256 indexed id, uint256 oldJump, uint256 newJump);
    error PriceJumpTooLarge(uint256 currentE18, uint256 newE18, uint256 maxJumpE18);
    // Custom errors for gas optimization
    error ZeroAddress();
    error MarketNotActive();
    error MarketExpired();
    error AlreadyResolved();
    error InsufficientBalance();
    error DustAmount();
    error SlippageExceeded();
    error MaxTradeExceeded();
    error NoLiquidity();
    error InvalidOracle();
    error StalePrice();
    error NegativePrice();
    error ZeroPrice();
    error BackingInsufficient();
    error SolvencyIssue();
    error InvalidExpiry();
    error InsufficientSeed();
    error InsufficientLiquidity();
    error InvalidMarket();
    error EarlyResolution();

    // ===========
    // Init
    // ===========
    constructor(address _usdc, address _treasury) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MARKET_CREATOR_ROLE, msg.sender);
    }

    // ===========
    // Math utils
    // ===========
    function mul(uint256 x, uint256 y) internal pure returns (uint256) { 
        // SCALE is non-zero constant
        unchecked {
            return (x * y) / SCALE; 
        }
    }
    function div(uint256 x, uint256 y) internal pure returns (uint256) { 
        require(y != 0, "div0");
        unchecked {
            return (x * SCALE) / y; 
        }
    }
    function exp2(uint256 x) internal pure returns (uint256) {
        if (x > 192 * SCALE) revert("exp2");
        uint256 intPart = x / SCALE;
        uint256 frac = x % SCALE;
        uint256 res = SCALE;
        uint256 term = SCALE;
        // LN2 is a positive constant hardcoded above
        uint256 y = mul(frac, LN2);
        for (uint8 i = 1; i <= 20;) {
            term = (mul(term, y)) / i;
            res += term;
            unchecked { ++i; }
        }
        if (intPart >= 256) revert("exp2: shift overflow");
        return (uint256(1) << intPart) * res;
    }
    function log2(uint256 x) internal pure returns (uint256) {
        require(x > 0, "log2");
        uint256 res = 0;
        if (x >= SCALE << 128) { x >>= 128; res += 128 * SCALE; }
        if (x >= SCALE << 64) { x >>= 64; res += 64 * SCALE; }
        if (x >= SCALE << 32) { x >>= 32; res += 32 * SCALE; }
        if (x >= SCALE << 16) { x >>= 16; res += 16 * SCALE; }
        if (x >= SCALE << 8) { x >>= 8; res += 8 * SCALE; }
        if (x >= SCALE << 4) { x >>= 4; res += 4 * SCALE; }
        if (x >= SCALE << 2) { x >>= 2; res += 2 * SCALE; }
        if (x >= SCALE << 1) { res += SCALE; x >>= 1; }
        uint256 z = div(x - SCALE, x + SCALE);
        uint256 z2 = mul(z, z);
        uint256 w = SCALE;
        w += mul(z2, SCALE) / 3;
        uint256 z4 = mul(z2, z2);
        w += mul(z4, SCALE) / 5;
        uint256 z6 = mul(z4, z2);
        w += mul(z6, SCALE) / 7;
        uint256 z8 = mul(z6, z2);
        w += mul(z8, SCALE) / 9;
        return res + mul(mul(z, w), TWO_OVER_LN2);
    }
    function ln(uint256 x) internal pure returns (uint256) {
        if (x == 0) revert("ln0");
        return mul(log2(x), LN2);
    }
    // LMSR cost function C(q) = max(qY,qN) + b * ln(1 + exp(|qY - qN| / b))
    function _C(uint256 qY, uint256 qN, uint256 b) internal pure returns (uint256) {
        require(b != 0, "b0");
        uint256 maxQ = qY > qN ? qY : qN;
        uint256 minQ = qY < qN ? qY : qN;
        uint256 pos = div(maxQ - minQ, b);
        uint256 scaled = mul(pos, LOG2_E);
        if (scaled > 192 * SCALE) {
            // exp(pos) too large; ln(1 + exp(-pos)) ≈ exp(-pos) ≈ 0
            return maxQ;
        }
        uint256 expPos = exp2(scaled);
        uint256 inner = SCALE + div(SCALE, expPos); // 1 + exp(-pos)
        return maxQ + mul(b, ln(inner));
    }

    // ===========
    // Pricing
    // ===========
    function _spotYesFromQ(uint256 qY, uint256 qN, uint256 b) internal pure returns (uint256) {
        require(b != 0, "b0");
        if (qY == qN) return 5e17;
        bool yGreater = qY > qN;
        uint256 absDelta = div(yGreater ? (qY - qN) : (qN - qY), b);
        uint256 scaled = mul(absDelta, LOG2_E);
        if (scaled > 192 * SCALE) return yGreater ? SCALE : 0;
        uint256 e = exp2(scaled);
        return yGreater ? div(e, SCALE + e) : div(SCALE, SCALE + e);
    }
    function spotPriceYesE18(uint256 id) public view returns (uint256) {
        Market storage m = markets[id];
        if (address(m.yes) == address(0)) revert InvalidMarket();
        return _spotYesFromQ(m.qYes, m.qNo, m.bE18);
    }
    function spotPriceYesE6(uint256 id) external view returns (uint256) {
        return spotPriceYesE18(id) / 1e12;
    }
    function spotPriceNoE6(uint256 id) external view returns (uint256) {
        return 1_000_000 - (spotPriceYesE18(id) / 1e12);
    }

    // ==================
    // Market creation
    // ==================
    function _validateFees(uint16 feeT, uint16 feeV, uint16 feeL) internal pure {
        if (feeT > MAX_FEE_BPS_PER || feeV > MAX_FEE_BPS_PER || feeL > MAX_FEE_BPS_PER) revert("feeper");
        uint256 total = uint256(feeT) + uint256(feeV) + uint256(feeL);
        if (total > MAX_FEE_BPS_TOTAL) revert("feetotal");
    }
    function createMarket(
        string memory question,
        string memory yesName, string memory yesSymbol,
        string memory noName, string memory noSymbol,
        uint256 initUsdc,
        uint256 expiryTimestamp,
        address oracle,
        bytes32 priceFeedId,
        uint256 targetValue,
        Comparison comparison
    ) external onlyRole(MARKET_CREATOR_ROLE) returns (uint256 id) {
        if (initUsdc < MIN_MARKET_SEED) revert InsufficientSeed();
        if (expiryTimestamp <= block.timestamp) revert InvalidExpiry();
        id = ++marketCount;
        PositionToken yes = new PositionToken(yesName, yesSymbol, address(this));
        PositionToken no = new PositionToken(noName, noSymbol, address(this));
        yes.grantRole(yes.MINTER_ROLE(), address(this));
        yes.grantRole(yes.BURNER_ROLE(), address(this));
        no.grantRole(no.MINTER_ROLE(), address(this));
        no.grantRole(no.BURNER_ROLE(), address(this));
        Market storage m = markets[id];
        m.yes = yes; m.no = no;
        m.lp = msg.sender;
        m.question = question;
        m.status = MarketStatus.Active;
        // 2% total = 1% treasury + 0% vault + 1% LP
        m.feeTreasuryBps = 100;
        m.feeVaultBps = 0;
        m.feeLpBps = 100;
        _validateFees(m.feeTreasuryBps, m.feeVaultBps, m.feeLpBps);
        // seed vault
        usdc.safeTransferFrom(msg.sender, address(this), initUsdc);
        m.usdcVault = initUsdc;
        // constant b (depth) based on initial seed (not updated by adds/removes)
        uint256 newB = (initUsdc * liquidityMultiplierE18 * USDC_TO_E18) / LN2;
        m.bE18 = newB;
        emit LiquidityParameterUpdated(id, newB, initUsdc);
        // resolution config
        OracleType oracleType = oracle == address(0) ? OracleType.None : OracleType.ChainlinkFeed;
        m.resolution = ResolutionConfig({
            expiryTimestamp: expiryTimestamp,
            oracleType: oracleType,
            oracleAddress: oracle,
            priceFeedId: oracleType == OracleType.ChainlinkFeed ? priceFeedId : bytes32(0),
            targetValue: targetValue,
            comparison: comparison,
            yesWins: false,
            isResolved: false
        });
        // initialize LP accounting
        lpShares[id][msg.sender] = initUsdc;
        lpFeeDebt[id][msg.sender] = (initUsdc * accFeePerUSDCE18[id]) / 1e18;
        m.totalLpUsdc = initUsdc;
        m.lpFeesUSDC = 0;
        // trade/band defaults
        m.maxUsdcPerTrade = 0; // 0 => use global
        m.priceBandThreshold = 10_000e6; // enable jump cap when vault < 10k USDC
        m.maxJumpE18 = 0; // 0 => use global maxInstantJumpE18
        emit MarketCreated(id, address(yes), address(no), question, initUsdc, expiryTimestamp);
    }

    // ==================
    // Liquidity (LP)
    // ==================
    // NOTE: No removeLiquidity. LPs cannot withdraw principal while active.
    function addLiquidity(uint256 id, uint256 usdcAdd) external nonReentrant whenNotPaused {
        Market storage m = markets[id];
        if (m.status != MarketStatus.Active) revert MarketNotActive();
        if (usdcAdd < MIN_LIQUIDITY_ADD) revert InsufficientLiquidity();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAdd);
        m.usdcVault += usdcAdd;
        // baseline debt so new liquidity doesn't earn past fees
        lpFeeDebt[id][msg.sender] += (usdcAdd * accFeePerUSDCE18[id]) / 1e18;
        lpShares[id][msg.sender] += usdcAdd;
        m.totalLpUsdc += usdcAdd;
        // Always calculate b - never set to 0 (division by zero risk)
        uint256 newB = (m.totalLpUsdc * liquidityMultiplierE18 * USDC_TO_E18) / LN2;
        m.bE18 = newB;
        emit LiquidityAdded(id, msg.sender, usdcAdd);
        emit LiquidityParameterUpdated(id, newB, m.totalLpUsdc);
    }
    // pending LP trading fees (view)
    function pendingLpFees(uint256 id, address lp) public view returns (uint256) {
        uint256 entitled = (lpShares[id][lp] * accFeePerUSDCE18[id]) / 1e18;
        return entitled - lpFeeDebt[id][lp];
    }
    function claimLpFees(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        uint256 pending = pendingLpFees(id, msg.sender);
        if (pending == 0) return;
        if (pending > m.lpFeesUSDC) revert InsufficientBalance();
        // effects
        lpFeeDebt[id][msg.sender] += pending;
        m.lpFeesUSDC -= pending;
        // interaction
        usdc.safeTransfer(msg.sender, pending);
        emit LpFeesClaimed(id, msg.sender, pending);
    }

    // ==================
    // Trading (LMSR)
    // ==================
    function findSharesOut(
        uint256 qS,
        uint256 qO,
        uint256 netE18,
        uint256 b
    ) internal pure returns (uint256) {
        uint256 qSLocal = qS;
        uint256 qOLocal = qO;
        uint256 bLocal = b;
        uint256 base = _C(qSLocal, qOLocal, bLocal);
        uint256 lo = 0;
        uint256 hi = bLocal; // start with b and expand
        while (_C(qSLocal + hi, qOLocal, bLocal) - base < netE18) {
            hi <<= 1;
            if (hi > bLocal * 1e6) { // cap bound growth
                hi = bLocal * 1e6;
                break;
            }
        }
        for (uint256 i = 0; i < 40;) {
            uint256 mid = (lo + hi) / 2;
            if (_C(qSLocal + mid, qOLocal, bLocal) - base <= netE18) {
                lo = mid;
            } else {
                hi = mid;
            }
            unchecked { ++i; }
        }
        return (lo + hi) / 2;
    }
    function _buy(uint256 id, bool isYes, uint256 usdcIn, uint256 minOut)
        internal
        returns (uint256 tokensOut, uint256 avgPriceE6)
    {
        Market storage m = markets[id];
        if (m.status != MarketStatus.Active) revert MarketNotActive();
        if (block.timestamp >= m.resolution.expiryTimestamp) revert MarketExpired();
        uint256 effectiveMax = m.maxUsdcPerTrade > 0 ? m.maxUsdcPerTrade : MAX_USDC_PER_TRADE;
        if (usdcIn > effectiveMax) revert MaxTradeExceeded();
        // Cache fee values to reduce storage reads
        uint16 feeTreasuryBps = m.feeTreasuryBps;
        uint16 feeVaultBps = m.feeVaultBps;
        uint16 feeLpBps = m.feeLpBps;
        // fees
        uint256 feeT = (usdcIn * feeTreasuryBps) / BPS_DENOMINATOR;
        uint256 feeV = (usdcIn * feeVaultBps) / BPS_DENOMINATOR;
        uint256 feeL = (usdcIn * feeLpBps) / BPS_DENOMINATOR;
        uint256 net = usdcIn - feeT - feeV - feeL;
        // pull funds
        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        // route fees
        if (feeT > 0) usdc.safeTransfer(treasury, feeT);
        if (feeV > 0) { m.usdcVault += feeV; } // kept in vault
        if (feeL > 0) {
            if (m.totalLpUsdc == 0) revert NoLiquidity();
            accFeePerUSDCE18[id] += (feeL * 1e18) / m.totalLpUsdc;
            m.lpFeesUSDC += feeL;
        }
        // add net to vault
        m.usdcVault += net;
        // convert net (6) -> (18) for cost function delta
        uint256 netE18 = net * USDC_TO_E18;
        // compute shares delta
        tokensOut = findSharesOut(
            isYes ? m.qYes : m.qNo,
            isYes ? m.qNo : m.qYes,
            netE18,
            m.bE18
        );
        if (tokensOut < DUST_THRESHOLD) revert DustAmount();
        // ---- Per-tx price jump cap (delta-based) on thin vaults ----
        if (m.usdcVault < m.priceBandThreshold) {
            uint256 newQYes = isYes ? (m.qYes + tokensOut) : m.qYes;
            uint256 newQNo = isYes ? m.qNo : (m.qNo + tokensOut);
            uint256 newPriceE18 = _spotYesFromQ(newQYes, newQNo, m.bE18);
            uint256 p0 = _spotYesFromQ(m.qYes, m.qNo, m.bE18);
            uint256 diff = p0 > newPriceE18 ? (p0 - newPriceE18) : (newPriceE18 - p0);
            uint256 cap = m.maxJumpE18 > 0 ? m.maxJumpE18 : maxInstantJumpE18;
            if (diff > cap) revert PriceJumpTooLarge(p0, newPriceE18, cap);
        }
        // ---- Backing check to prevent underbacking ----
        {
            uint256 newQYes = isYes ? (m.qYes + tokensOut) : m.qYes;
            uint256 newQNo = isYes ? m.qNo : (m.qNo + tokensOut);
            uint256 approxRequired = ((newQYes > newQNo ? newQYes : newQNo) * PRICE_DECIMALS_E6) / 1e18;
            if (m.usdcVault < approxRequired) revert BackingInsufficient();
        }
        if (tokensOut < minOut) revert SlippageExceeded();
        // -----------------------------------------------------------
        // mint & update q
        if (isYes) {
            m.yes.mint(msg.sender, tokensOut);
            m.qYes += tokensOut;
        } else {
            m.no.mint(msg.sender, tokensOut);
            m.qNo += tokensOut;
        }
        // avg price in 1e6
        avgPriceE6 = (usdcIn * 1e12) / tokensOut;
        uint256 pAfterE6 = _spotYesFromQ(m.qYes, m.qNo, m.bE18) / 1e12;
        emit Buy(id, msg.sender, isYes, usdcIn, tokensOut, pAfterE6);
    }
    function _sell(uint256 id, bool isYes, uint256 tokensIn, uint256 minOut)
        internal
        returns (uint256 usdcOut, uint256 avgPriceE6)
    {
        Market storage m = markets[id];
        if (m.status != MarketStatus.Active) revert MarketNotActive();
        if (tokensIn < DUST_THRESHOLD) revert DustAmount();
        uint256 qSide = isYes ? m.qYes : m.qNo;
        if (tokensIn > qSide) revert InsufficientBalance();
        uint256 oldC = _C(m.qYes, m.qNo, m.bE18);
        uint256 newC = _C(
            isYes ? m.qYes - tokensIn : m.qYes,
            isYes ? m.qNo : m.qNo - tokensIn,
            m.bE18
        );
        uint256 refundE18 = oldC - newC;
        usdcOut = refundE18 / USDC_TO_E18;
        if (usdcOut > m.usdcVault) revert SolvencyIssue();
        // Backing check (approx required = max(newQYes, newQNo) * $1)
        uint256 newQYes = isYes ? m.qYes - tokensIn : m.qYes;
        uint256 newQNo = isYes ? m.qNo : m.qNo - tokensIn;
        uint256 approxRequired = ((newQYes > newQNo ? newQYes : newQNo) * PRICE_DECIMALS_E6) / 1e18;
        if (m.usdcVault - usdcOut < approxRequired) revert BackingInsufficient();
        // ---- Optional: per-tx jump cap on sells on thin vaults ----
        if (m.usdcVault < m.priceBandThreshold) {
            uint256 newPriceE18_ = _spotYesFromQ(newQYes, newQNo, m.bE18);
            uint256 p0_ = _spotYesFromQ(m.qYes, m.qNo, m.bE18);
            uint256 diff_ = p0_ > newPriceE18_ ? (p0_ - newPriceE18_) : (newPriceE18_ - p0_);
            uint256 cap_ = m.maxJumpE18 > 0 ? m.maxJumpE18 : maxInstantJumpE18;
            if (diff_ > cap_) revert PriceJumpTooLarge(p0_, newPriceE18_, cap_);
        }
        if (usdcOut < minOut) revert SlippageExceeded();
        // -----------------------------------------------------------
        m.usdcVault -= usdcOut;
        if (isYes) {
            m.yes.burn(msg.sender, tokensIn);
            m.qYes -= tokensIn;
        } else {
            m.no.burn(msg.sender, tokensIn);
            m.qNo -= tokensIn;
        }
        usdc.safeTransfer(msg.sender, usdcOut);
        avgPriceE6 = (usdcOut * 1e12) / tokensIn;
        uint256 pAfterE6 = _spotYesFromQ(m.qYes, m.qNo, m.bE18) / 1e12;
        emit Sell(id, msg.sender, isYes, tokensIn, usdcOut, pAfterE6);
    }

    // external trade entrypoints
    function buyYes(uint256 id, uint256 usdcIn, uint256 minOut) external nonReentrant whenNotPaused {
        _buy(id, true, usdcIn, minOut);
    }
    function buyNo(uint256 id, uint256 usdcIn, uint256 minOut) external nonReentrant whenNotPaused {
        _buy(id, false, usdcIn, minOut);
    }
    function sellYes(uint256 id, uint256 tokensIn, uint256 minOut) external nonReentrant whenNotPaused {
        _sell(id, true, tokensIn, minOut);
    }
    function sellNo(uint256 id, uint256 tokensIn, uint256 minOut) external nonReentrant whenNotPaused {
        _sell(id, false, tokensIn, minOut);
    }

    // ==================
    // Resolution / Oracles
    // ==================
    function checkUpkeep(uint256 id) external view returns (bool, bytes memory) {
        Market storage m = markets[id];
        bool need = m.status == MarketStatus.Active
            && !m.resolution.isResolved
            && block.timestamp >= m.resolution.expiryTimestamp
            && m.resolution.oracleType != OracleType.None;
        return (need, abi.encode(id));
    }
    function getMarketResolution(uint256 id) external view returns (ResolutionConfig memory) {
        return markets[id].resolution;
    }
    function resolveWithFeed(uint256 id) external {
        if (block.timestamp < markets[id].resolution.expiryTimestamp) revert EarlyResolution();
        Market storage m = markets[id]; // Gas optimization: cache storage read
        if (m.resolution.isResolved) revert AlreadyResolved();
        if (m.resolution.oracleAddress == address(0)) revert InvalidOracle();
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(m.resolution.oracleAddress);
        ( , int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        
        // Validate price is positive
        if (price <= 0) revert NegativePrice();
        if (block.timestamp - updatedAt >= ORACLE_STALENESS_THRESHOLD) revert StalePrice();
        
        // Get feed decimals and normalize price to 8 decimals (standard for most Chainlink feeds)
        // targetValue is expected to be in 8 decimals
        uint8 feedDecimals = priceFeed.decimals();
        uint256 normalizedPrice;
        
        if (feedDecimals > 8) {
            // Scale down: divide by 10^(feedDecimals - 8)
            normalizedPrice = uint256(price) / (10 ** (feedDecimals - 8));
        } else if (feedDecimals < 8) {
            // Scale up: multiply by 10^(8 - feedDecimals)
            normalizedPrice = uint256(price) * (10 ** (8 - feedDecimals));
        } else {
            // Already 8 decimals
            normalizedPrice = uint256(price);
        }
        
        // Compare normalized price with targetValue (both in 8 decimals)
        bool yesWins;
        if (normalizedPrice > m.resolution.targetValue) {
            yesWins = m.resolution.comparison == Comparison.Above;
        } else if (normalizedPrice < m.resolution.targetValue) {
            yesWins = m.resolution.comparison == Comparison.Below;
        } else {
            yesWins = m.resolution.comparison == Comparison.Equals;
        }
        m.resolution.yesWins = yesWins;
        m.resolution.isResolved = true;
        m.status = MarketStatus.Resolved;
        emit MarketResolved(id, yesWins);
    }
    function resolveMarketWithPrice(uint256 id, uint256 price) external {
        if (msg.sender != chainlinkResolver && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert("auth");
        require(markets[id].status == MarketStatus.Active && !markets[id].resolution.isResolved, "done");
        if (block.timestamp < markets[id].resolution.expiryTimestamp) revert EarlyResolution();
        if (price == 0) revert ZeroPrice();
        Market storage m = markets[id]; // Gas optimization: cache storage read
        // Price is expected to be in 8 decimals (same as targetValue)
        // ChainlinkResolver should normalize before calling this function
        bool yesWins;
        if (price > m.resolution.targetValue) {
            yesWins = m.resolution.comparison == Comparison.Above;
        } else if (price < m.resolution.targetValue) {
            yesWins = m.resolution.comparison == Comparison.Below;
        } else {
            yesWins = m.resolution.comparison == Comparison.Equals;
        }
        m.resolution.yesWins = yesWins;
        m.resolution.isResolved = true;
        m.status = MarketStatus.Resolved;
        emit MarketResolved(id, yesWins);
    }
    function resolveMarket(uint256 id, bool yesWins) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(markets[id].status == MarketStatus.Active && !markets[id].resolution.isResolved, "done");
        // Prevent admin front-running - must wait until expiry
        if (block.timestamp < markets[id].resolution.expiryTimestamp) revert EarlyResolution();
        Market storage m = markets[id]; // Gas optimization: cache storage read
        m.resolution.yesWins = yesWins;
        m.resolution.isResolved = true;
        m.status = MarketStatus.Resolved;
        emit MarketResolved(id, yesWins);
    }

    // ==================
    // Redeem (winners)
    // ==================
    function redeem(uint256 id, bool isYes) external nonReentrant whenNotPaused {
        Market storage m = markets[id];
        if (m.status != MarketStatus.Resolved || !m.resolution.isResolved) revert MarketNotActive();
        if (isYes != m.resolution.yesWins) revert("lose");
        uint256 balance = isYes ? m.yes.balanceOf(msg.sender) : m.no.balanceOf(msg.sender);
        if (balance == 0) revert InsufficientBalance();
        uint256 totalWinning = isYes ? m.yes.totalSupply() : m.no.totalSupply();
        if (totalWinning == 0) revert("!win");
        // Convert 18-decimal positions to 6-decimal USDC ($1 per winning share)
        uint256 usdcOut = (balance * PRICE_DECIMALS_E6) / PRICE_DECIMALS_E18;
        if (usdcOut == 0) revert DustAmount();
        uint256 required = (totalWinning * PRICE_DECIMALS_E6) / PRICE_DECIMALS_E18;
        if (m.usdcVault < required) revert InsufficientBalance();
        // Cache token reference to avoid repeated storage reads
        PositionToken token = isYes ? m.yes : m.no;
        token.burn(msg.sender, balance);
        m.usdcVault -= usdcOut;
        usdc.safeTransfer(msg.sender, usdcOut);
        emit Redeemed(id, msg.sender, usdcOut);
    }

    // ==================
    // Residual (LP-only) after all redemptions
    // ==================
    /// @notice Finalize any leftover vault USDC to LPs pro-rata AFTER all winning shares are redeemed.
    function finalizeResidual(uint256 id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Market storage m = markets[id];
        if (m.status != MarketStatus.Resolved || !m.resolution.isResolved) revert MarketNotActive();
        // ensure all winning supply has been redeemed
        bool yesWins = m.resolution.yesWins;
        // Cache token reference to avoid repeated storage reads
        PositionToken winningToken = yesWins ? m.yes : m.no;
        uint256 winningSupply = winningToken.totalSupply();
        if (winningSupply != 0) revert("!zero");
        uint256 leftover = m.usdcVault;
        if (leftover == 0) {
            emit ResidualFinalized(id, 0, m.totalLpUsdc);
            return;
        }
        if (m.totalLpUsdc == 0) revert NoLiquidity();
        // index the entire leftover to LPs and move it to residual pot
        accResidualPerUSDCE18[id] += (leftover * 1e18) / m.totalLpUsdc;
        lpResidualUSDC[id] += leftover;
        // zero the vault (residual is now separate, untouchable by redemptions)
        m.usdcVault = 0;
        emit ResidualFinalized(id, leftover, m.totalLpUsdc);
    }
    function pendingLpResidual(uint256 id, address lp) public view returns (uint256) {
        uint256 entitled = (lpShares[id][lp] * accResidualPerUSDCE18[id]) / 1e18;
        return entitled - lpResidualDebt[id][lp];
    }
    function claimLpResidual(uint256 id) external nonReentrant {
        uint256 pending = pendingLpResidual(id, msg.sender);
        if (pending == 0) return;
        uint256 pot = lpResidualUSDC[id];
        if (pending > pot) revert InsufficientBalance();
        // effects
        lpResidualDebt[id][msg.sender] += pending;
        lpResidualUSDC[id] = pot - pending;
        // interaction
        usdc.safeTransfer(msg.sender, pending);
        emit LpResidualClaimed(id, msg.sender, pending);
    }

    // ==================
    // UI helpers / monitoring
    // ==================
    function getMarketState(uint256 id) external view returns (
        uint256 qYes, uint256 qNo, uint256 vault, uint256 b, uint256 pYesE6
    ) {
        Market storage m = markets[id];
        if (address(m.yes) == address(0)) revert InvalidMarket();
        qYes = m.qYes;
        qNo = m.qNo;
        vault = m.usdcVault;
        b = m.bE18;
        pYesE6 = spotPriceYesE18(id) / 1e12;
    }
    /// @notice Returns largest USDC buy amount that would NOT exceed the jump cap (under current state).
    function maxUsdcBeforeJump(uint256 id, bool isYes) external view returns (uint256 maxUsdcE6) {
        Market storage m = markets[id];
        if (address(m.yes) == address(0)) revert InvalidMarket();
        // If vault is deep, no jump cap active under current policy
        if (m.usdcVault >= m.priceBandThreshold) {
            return (m.maxUsdcPerTrade > 0 ? m.maxUsdcPerTrade : MAX_USDC_PER_TRADE);
        }
        uint256 cap = m.maxJumpE18 > 0 ? m.maxJumpE18 : maxInstantJumpE18;
        uint256 p0 = _spotYesFromQ(m.qYes, m.qNo, m.bE18);
        uint16 feeT = m.feeTreasuryBps;
        uint16 feeV = m.feeVaultBps;
        uint16 feeL = m.feeLpBps;
        uint256 lo = 0;
        uint256 hi = (m.maxUsdcPerTrade > 0 ? m.maxUsdcPerTrade : MAX_USDC_PER_TRADE);
        for (uint256 i = 0; i < 40;) {
            uint256 mid = (lo + hi) / 2;
            // simulate net after fees (same as _buy)
            uint256 feeTamt = (mid * feeT) / BPS_DENOMINATOR;
            uint256 feeVamt = (mid * feeV) / BPS_DENOMINATOR;
            uint256 feeLamt = (mid * feeL) / BPS_DENOMINATOR;
            uint256 net = mid - feeTamt - feeVamt - feeLamt;
            if (net == 0) { hi = mid; unchecked { ++i; } continue; }
            uint256 tokensOut = findSharesOut(
                isYes ? m.qYes : m.qNo,
                isYes ? m.qNo : m.qYes,
                net * USDC_TO_E18,
                m.bE18
            );
            if (tokensOut == 0) { hi = mid; unchecked { ++i; } continue; }
            uint256 newQYes = isYes ? (m.qYes + tokensOut) : m.qYes;
            uint256 newQNo = isYes ? m.qNo : (m.qNo + tokensOut);
            uint256 newP = _spotYesFromQ(newQYes, newQNo, m.bE18);
            uint256 diff = p0 > newP ? (p0 - newP) : (newP - p0);
            bool ok = diff <= cap;
            if (ok) { lo = mid; } else { hi = mid; }
            unchecked { ++i; }
        }
        return lo;
    }
    // Sum of vault + LP fee pot + residual pot (per-market).
    function invariantUsdc(uint256 id) external view returns (uint256) {
        Market storage m = markets[id];
        return m.usdcVault + m.lpFeesUSDC + lpResidualUSDC[id];
    }
    function liabilityE6(uint256 id) external view returns (uint256) {
        Market storage m = markets[id];
        if (address(m.yes) == address(0)) revert InvalidMarket();
        uint256 maxQ = m.qYes > m.qNo ? m.qYes : m.qNo;
        return (maxQ * PRICE_DECIMALS_E6) / 1e18;
    }

    // ==================
    // Admin
    // ==================
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    function setTreasury(address a) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (a == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = a;
        emit TreasurySet(oldTreasury, a);
    }
    function setChainlinkResolver(address a) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (a == address(0)) revert ZeroAddress();
        address oldResolver = chainlinkResolver;
        chainlinkResolver = a;
        emit ChainlinkResolverSet(oldResolver, a);
    }
    function setLiquidityMultiplier(uint256 x) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (x == 0) revert("zero");
        if (x >= 1e24) revert("big");
        uint256 oldMultiplier = liquidityMultiplierE18;
        liquidityMultiplierE18 = x;
        emit LiquidityMultiplierSet(oldMultiplier, x);
    }
    function setPriceFeedId(uint256 id, bytes32 feedId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 oldFeedId = markets[id].resolution.priceFeedId;
        markets[id].resolution.priceFeedId = feedId;
        emit PriceFeedIdSet(id, oldFeedId, feedId);
    }
    function setMaxUsdcPerTrade(uint256 id, uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldMax = markets[id].maxUsdcPerTrade;
        markets[id].maxUsdcPerTrade = v; // 0 => use global constant
        emit MaxUsdcPerTradeSet(id, oldMax, v);
    }
    function setPriceBandThreshold(uint256 id, uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldThreshold = markets[id].priceBandThreshold;
        markets[id].priceBandThreshold = v; // 0 => always enforce jump cap
        emit PriceBandThresholdSet(id, oldThreshold, v);
    }
    function setMaxInstantJump(uint256 vE18) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vE18 == 0 || vE18 >= 1e18) revert("jump");
        uint256 oldJump = maxInstantJumpE18;
        maxInstantJumpE18 = vE18;
        emit MaxInstantJumpSet(oldJump, vE18);
    }
    function setMarketMaxInstantJump(uint256 id, uint256 vE18) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vE18 >= 1e18) revert("jump"); // allow 0 => use global
        uint256 oldJump = markets[id].maxJumpE18;
        markets[id].maxJumpE18 = vE18;
        emit MarketMaxInstantJumpSet(id, oldJump, vE18);
    }
    /// @notice Admin setter to update per-market fees under strict caps.
    function setFeesBps(uint256 id, uint16 feeT, uint16 feeV, uint16 feeL) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Market storage m = markets[id];
        if (address(m.yes) == address(0)) revert InvalidMarket();
        _validateFees(feeT, feeV, feeL);
        m.feeTreasuryBps = feeT;
        m.feeVaultBps = feeV;
        m.feeLpBps = feeL;
        emit FeesUpdated(id, feeT, feeV, feeL);
    }
    // Sweep tiny rounding leftovers from the LP fee or residual pots (admin judgement)
    function sweepDust(uint256 id, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert("zero");
        Market storage m = markets[id];
        uint256 residualDust = lpResidualUSDC[id]; // Cache storage read
        uint256 totalDust = m.lpFeesUSDC + residualDust;
        if (amount > totalDust) revert("dust");
        // Prefer sweeping from lpFeesUSDC first, then residual
        uint256 fromFees = amount <= m.lpFeesUSDC ? amount : m.lpFeesUSDC;
        uint256 fromResidual = 0;
        if (fromFees < amount) {
            fromResidual = amount - fromFees;
            if (fromResidual > residualDust) revert("resid");
        }
        if (fromFees > 0) {
            m.lpFeesUSDC -= fromFees;
        }
        if (fromResidual > 0) {
            lpResidualUSDC[id] -= fromResidual;
        }
        usdc.safeTransfer(to, fromFees + fromResidual);
        emit DustSwept(id, to, fromFees + fromResidual);
    }
    // Top-up vault if underbacked (from admin/treasury)
    function topUpVault(uint256 id, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Market storage m = markets[id];
        if (amount == 0) revert("zero");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        m.usdcVault += amount;
        emit VaultTopUp(id, amount);
    }
}