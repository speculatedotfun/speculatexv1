// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/AggregatorV3Interface.sol";
import "./interfaces/AutomationCompatibleInterface.sol";
import "./SpeculateCore.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ChainlinkResolver
 * @notice Single global resolver that automatically resolves ALL markets (existing + future)
 * @dev Scans SpeculateCore markets, uses global price feeds by feed ID, and Chainlink Automation
 */
contract ChainlinkResolver is AutomationCompatibleInterface, Pausable {
    SpeculateCore public immutable core;
    address public owner;
    
    // Global Chainlink feeds by feed ID (e.g., keccak256("ETH/USD"))
    mapping(bytes32 => address) public globalFeeds;
    // Optional secondary feeds for multi-source verification (by feed ID)
    mapping(bytes32 => address) public secondaryFeeds;
    // Last known valid normalized price per feed ID (8 decimals)
    mapping(bytes32 => uint256) public lastValidPriceE8;
    // Bounds for price movement vs previous valid price (in BPS). Default: 5000 (±50%)
    uint256 public priceBoundsBps = 5000;
    // Required agreement tolerance between primary and secondary feeds (in BPS). Default: 200 (2%)
    uint256 public crossVerifyToleranceBps = 200;
    // Staleness threshold (configurable). Default: 1 hour.
    uint256 public staleThreshold = 1 hours;
    
    // Persistent cursor for batch processing
    uint256 public nextBatchStartIndex;
    
    event FeedRegistered(bytes32 indexed feedId, address feedAddress);
    event SecondaryFeedRegistered(bytes32 indexed feedId, address feedAddress);
    event MarketResolved(uint256 indexed marketId, bool yesWins, uint256 price);
    event BatchCheckCompleted(uint256 startIndex, uint256 endIndex, uint256 marketsChecked, uint256 nextBatchStart);
    event PriceBoundsUpdated(uint256 oldBps, uint256 newBps);
    event CrossVerifyToleranceUpdated(uint256 oldBps, uint256 newBps);
    event StaleThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    /**
     * @notice Reset batch cursor (admin function for manual reset if needed)
     * @param startIndex New starting index for batch processing
     */
    function setNextBatchStartIndex(uint256 startIndex) external onlyOwner {
        nextBatchStartIndex = startIndex;
    }

    constructor(address _core) {
        require(_core != address(0), "zero core");
        core = SpeculateCore(_core);
        owner = msg.sender;
    }

    // ============
    // Admin
    // ============
    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Register or update a Chainlink feed once globally (by feed ID)
     * @param feedId A bytes32 ID like keccak256("ETH/USD") or keccak256("BTC/USD")
     * @param feedAddress Chainlink AggregatorV3Interface address
     * @dev Once registered, all markets using this feedId will automatically use this address
     */
    function setGlobalFeed(bytes32 feedId, address feedAddress) external onlyOwner {
        require(feedAddress != address(0), "zero feed");
        
        // Note: Validation removed to allow setting feeds that may not exist yet on testnet
        // The feed will be validated when actually used in performUpkeep
        
        globalFeeds[feedId] = feedAddress;
        emit FeedRegistered(feedId, feedAddress);
    }

    /**
     * @notice Register or update an optional secondary feed (for cross-verification)
     */
    function setSecondaryFeed(bytes32 feedId, address feedAddress) external onlyOwner {
        secondaryFeeds[feedId] = feedAddress;
        emit SecondaryFeedRegistered(feedId, feedAddress);
    }

    /**
     * @notice Update price bounds vs last valid price (in BPS). Example: 5000 = ±50%.
     */
    function setPriceBoundsBps(uint256 bps) external onlyOwner {
        require(bps <= 100_000, "bounds too high"); // max 1000% just in case
        uint256 old = priceBoundsBps;
        priceBoundsBps = bps;
        emit PriceBoundsUpdated(old, bps);
    }

    /**
     * @notice Update tolerance for primary vs secondary feed agreement (in BPS). Example: 200 = 2%.
     */
    function setCrossVerifyToleranceBps(uint256 bps) external onlyOwner {
        require(bps <= 10_000, "tolerance too high"); // max 100%
        uint256 old = crossVerifyToleranceBps;
        crossVerifyToleranceBps = bps;
        emit CrossVerifyToleranceUpdated(old, bps);
    }
    /**
     * @notice Update staleness threshold for price freshness checks.
     */
    function setStaleThreshold(uint256 seconds_) external onlyOwner {
        require(seconds_ >= 300 && seconds_ <= 6 hours, "bad threshold"); // 5m .. 6h safety
        uint256 old = staleThreshold;
        staleThreshold = seconds_;
        emit StaleThresholdUpdated(old, seconds_);
    }

    /// @dev Legacy stub kept for backwards compatibility with old scripts. No-op.
    function registerMarket(uint256 /*marketId*/, address /*priceFeed*/) external pure {
        revert("registerMarket deprecated");
    }

    /**
     * @notice Check if upkeep is needed (Chainlink Automation)
     * @param checkData Encoded start index (optional). If empty, uses persistent nextBatchStartIndex.
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Data to pass to performUpkeep (encoded market ID and next batch start)
     * @dev Uses persistent cursor to avoid missing markets in large batches
     */
    function checkUpkeep(bytes calldata checkData) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        if (paused()) return (false, "");
        // Get start index from checkData, or use persistent cursor, or default to 1
        uint256 startIndex = 1;
        if (checkData.length > 0) {
            startIndex = abi.decode(checkData, (uint256));
        } else if (nextBatchStartIndex > 0) {
            startIndex = nextBatchStartIndex;
        }
        
        // Get total market count
        uint256 totalMarkets = core.marketCount();
        if (totalMarkets == 0) {
            return (false, "");
        }
        
        // Limit to checking 50 markets per call to avoid gas issues
        uint256 maxMarketsToCheck = 50;
        uint256 endIndex = startIndex + maxMarketsToCheck;
        if (endIndex > totalMarkets + 1) {
            endIndex = totalMarkets + 1; // +1 because we use < in the loop
        }
        
        // Loop through markets starting from startIndex
        for (uint256 i = startIndex; i < endIndex; i++) {
            // Check if this market needs resolution
            (bool needsUpkeep, bytes memory marketPerformData) = core.checkUpkeep(i);
            
            if (needsUpkeep) {
                // Found a market that needs resolution
                // Calculate next batch start (wrap around if needed)
                uint256 nextBatchStart = i < totalMarkets ? (i + 1) : 1;
                return (true, abi.encode(i, nextBatchStart));
            }
        }
        
        // No markets in this batch need resolution
        // Calculate next batch start for next check
        uint256 nextStart = endIndex <= totalMarkets ? endIndex : 1;
        // Return true with special market ID 0 to indicate cursor update only
        // This ensures the cursor advances even when no markets need resolution
        if (nextStart != startIndex) {
            return (true, abi.encode(0, nextStart)); // marketId 0 = cursor update only
        }
        return (false, "");
    }

    /**
     * @notice Perform upkeep (Chainlink Automation)
     * @param performData Encoded market ID and next batch start index
     * @dev Automatically resolves markets using global feed mapping by priceFeedId
     */
    function performUpkeep(bytes calldata performData) external override {
        require(!paused(), "paused");
        (uint256 marketId, uint256 nextStart) = abi.decode(performData, (uint256, uint256));
        
        // Update persistent cursor for next batch
        nextBatchStartIndex = nextStart;
        
        // If marketId is 0, this is just a cursor update (no market to resolve)
        if (marketId == 0) {
            return;
        }
        
        // Check if market can be auto-resolved
        (bool upkeepNeeded, ) = core.checkUpkeep(marketId);
        require(upkeepNeeded, "upkeep not needed");

        // Get market resolution config
        SpeculateCore.ResolutionConfig memory resolution = core.getMarketResolution(marketId);
        require(resolution.oracleType == SpeculateCore.OracleType.ChainlinkFeed, "not chainlink");
        
        // Get price feed address from global feeds mapping using priceFeedId
        address priceFeedAddress = globalFeeds[resolution.priceFeedId];
        
        // Fallback to oracleAddress if global feed not set (backward compatibility)
        if (priceFeedAddress == address(0)) {
            priceFeedAddress = resolution.oracleAddress;
        }
        
        require(priceFeedAddress != address(0), "feed not registered");
        bytes32 feedId = resolution.priceFeedId;

        uint256 currentPrice = _getChainlinkPrice(priceFeedAddress);

        // Optional: multi-source verification
        address secondary = secondaryFeeds[feedId];
        if (secondary != address(0) && secondary != priceFeedAddress) {
            uint256 secondaryPrice = _getChainlinkPrice(secondary);
            // Require agreement within tolerance
            uint256 maxP = currentPrice > secondaryPrice ? currentPrice : secondaryPrice;
            uint256 minP = currentPrice > secondaryPrice ? secondaryPrice : currentPrice;
            // If both > 0, require |p1 - p2| / max(p1,p2) <= tolerance
            require(maxP > 0, "zero price");
            uint256 diffBps = ((maxP - minP) * 10_000) / maxP;
            require(diffBps <= crossVerifyToleranceBps, "oracle mismatch");
            // Use the average of the two for robustness
            currentPrice = (currentPrice + secondaryPrice) / 2;
        }

        // Price bounds vs previous valid
        uint256 lastPrice = lastValidPriceE8[feedId];
        if (lastPrice > 0 && priceBoundsBps > 0) {
            uint256 maxAllowed = lastPrice + ((lastPrice * priceBoundsBps) / 10_000);
            uint256 minAllowed = lastPrice > ((lastPrice * priceBoundsBps) / 10_000)
                ? lastPrice - ((lastPrice * priceBoundsBps) / 10_000)
                : 0;
            require(currentPrice >= minAllowed && currentPrice <= maxAllowed, "price out of bounds");
        }
        
        // Resolve market with price
        core.resolveMarketWithPrice(marketId, currentPrice);
        // Update last valid price after a successful use
        if (feedId != bytes32(0)) {
            lastValidPriceE8[feedId] = currentPrice;
        }
        
        // Get the resolution result to determine winner
        SpeculateCore.ResolutionConfig memory resolvedConfig = core.getMarketResolution(marketId);
        bool yesWins = resolvedConfig.yesWins;
        
        emit MarketResolved(marketId, yesWins, currentPrice);
    }

    /**
     * @notice Get latest price from Chainlink feed
     * @param priceFeedAddress Chainlink AggregatorV3Interface address
     * @return price Latest price normalized to 8 decimals (standard for most feeds)
     */
    function _getChainlinkPrice(address priceFeedAddress) internal view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
        
        (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        require(price > 0, "invalid price");
        require(timeStamp > 0, "round not complete");
        require(answeredInRound >= roundID, "stale data");
        require(block.timestamp - timeStamp < staleThreshold, "stale data");

        // Get feed decimals and normalize to 8 decimals
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
        
        return normalizedPrice;
    }

}

