// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SpeculateCore.sol";
import "../src/ChainlinkResolver.sol";

contract CheckChainlinkSetup is Script {
    function run() external view {
        console.log("\n=== CHECKING CHAINLINK SETUP ===\n");

        // Get addresses from environment
        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address resolverAddress = vm.envOr("CHAINLINK_RESOLVER_ADDRESS", address(0));

        console.log("SpeculateCore:", coreAddress);
        console.log("ChainlinkResolver:", resolverAddress);
        console.log("");

        if (coreAddress == address(0) || resolverAddress == address(0)) {
            console.log("ERROR: Missing addresses in environment!");
            return;
        }

        SpeculateCore core = SpeculateCore(coreAddress);
        ChainlinkResolver resolver = ChainlinkResolver(resolverAddress);

        // Check core-resolver connection
        console.log("--- Core-Resolver Connection ---");
        address coreResolver = core.chainlinkResolver();
        console.log("Core.chainlinkResolver():", coreResolver);

        if (coreResolver == resolverAddress) {
            console.log("SUCCESS: Core is connected to resolver");
        } else {
            console.log("ERROR: Core is NOT connected to resolver!");
        }
        console.log("");

        // Check resolver-core connection
        console.log("--- Resolver-Core Connection ---");
        address resolverCore = address(resolver.core());
        console.log("Resolver.core():", resolverCore);

        if (resolverCore == coreAddress) {
            console.log("SUCCESS: Resolver is connected to core");
        } else {
            console.log("ERROR: Resolver is NOT connected to core!");
        }
        console.log("");

        // Check global feeds
        console.log("--- Global Feeds ---");
        bytes32 btcFeedId = keccak256(bytes("BTC/USD"));
        bytes32 ethFeedId = keccak256(bytes("ETH/USD"));

        address btcFeed = resolver.globalFeeds(btcFeedId);
        address ethFeed = resolver.globalFeeds(ethFeedId);

        console.log("BTC/USD feed:", btcFeed);
        console.log("ETH/USD feed:", ethFeed);

        if (btcFeed != address(0)) {
            console.log("SUCCESS: BTC/USD feed registered");
        } else {
            console.log("ERROR: BTC/USD feed NOT registered!");
        }

        if (ethFeed != address(0)) {
            console.log("SUCCESS: ETH/USD feed registered");
        } else {
            console.log("ERROR: ETH/USD feed NOT registered!");
        }
        console.log("");

        // Check markets
        console.log("--- Markets ---");
        uint256 marketCount = core.marketCount();
        console.log("Total markets:", marketCount);

        for (uint256 i = 1; i <= marketCount; i++) {
            SpeculateCore.ResolutionConfig memory resolution = core.getMarketResolution(i);
            if (resolution.expiryTimestamp > 0) {
                console.log("Market", i, "- Oracle Type:", uint256(resolution.oracleType));
                console.log("  Expiry:", resolution.expiryTimestamp);
                console.log("  Resolved:", resolution.isResolved);

                // Check if this market needs upkeep
                (bool needsUpkeep,) = core.checkUpkeep(i);
                if (needsUpkeep) {
                    console.log("  NEEDS RESOLUTION");
                } else {
                    console.log("  Waiting for expiry or already resolved");
                }
                console.log("");
            }
        }

        // Check resolver upkeep
        console.log("--- ChainlinkResolver Upkeep Check ---");
        (bool upkeepNeeded, bytes memory performData) = resolver.checkUpkeep("");
        if (upkeepNeeded) {
            uint256 marketId = abi.decode(performData, (uint256));
            console.log("SUCCESS: Upkeep needed for market:", marketId);
        } else {
            console.log("INFO: No upkeep needed at this time");
        }
    }
}
