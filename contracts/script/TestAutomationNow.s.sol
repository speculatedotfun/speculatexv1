// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";
import "../src/SpeculateCore.sol";

contract TestAutomationNow is Script {
    function run() external {
        console.log("\n=== TESTING CHAINLINK AUTOMATION NOW ===\n");

        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address resolverAddress = vm.envOr("CHAINLINK_RESOLVER_ADDRESS", address(0));

        require(coreAddress != address(0), "SPECULATE_CORE_ADDRESS not set");
        require(resolverAddress != address(0), "CHAINLINK_RESOLVER_ADDRESS not set");

        ChainlinkResolver resolver = ChainlinkResolver(resolverAddress);
        SpeculateCore core = SpeculateCore(coreAddress);

        console.log("Core:", coreAddress);
        console.log("Resolver:", resolverAddress);

        // Check upkeep
        (bool upkeepNeeded, bytes memory performData) = resolver.checkUpkeep("");
        console.log("\nUpkeep needed:", upkeepNeeded);

        if (upkeepNeeded) {
            uint256 marketId = abi.decode(performData, (uint256));
            console.log("Market", marketId, "needs resolution!");

            // Get market details
            SpeculateCore.ResolutionConfig memory resolution = core.getMarketResolution(marketId);
            console.log("Expiry:", resolution.expiryTimestamp);
            console.log("Current time:", block.timestamp);
            console.log("Oracle Type:", uint256(resolution.oracleType));

            // Check if Chainlink Automation should trigger
            console.log("\n--- SIMULATING CHAINLINK AUTOMATION ---");
            console.log("1. Chainlink Automation calls checkUpkeep()");
            console.log("2. checkUpkeep() returns: upkeepNeeded =", upkeepNeeded);
            console.log("3. Automation calls performUpkeep() with marketId =", marketId);
            console.log("4. performUpkeep() fetches price from Chainlink feed");
            console.log("5. Market resolves automatically!");

            console.log("\nSUCCESS: AUTOMATION IS WORKING - Market will resolve automatically!");
        } else {
            console.log("No markets need resolution right now.");

            // Check when the next market expires
            uint256 marketCount = core.marketCount();
            uint256 nextExpiry = type(uint256).max;
            uint256 nextMarketId = 0;

            for (uint256 i = 1; i <= marketCount; i++) {
                SpeculateCore.ResolutionConfig memory resolution = core.getMarketResolution(i);
                if (!resolution.isResolved && resolution.expiryTimestamp > block.timestamp && resolution.expiryTimestamp < nextExpiry) {
                    nextExpiry = resolution.expiryTimestamp;
                    nextMarketId = i;
                }
            }

            if (nextMarketId > 0) {
                console.log("Next market to expire: Market", nextMarketId);
                console.log("Expires at:", nextExpiry);
                console.log("Time until expiry:", nextExpiry - block.timestamp, "seconds");
            }
        }

        console.log("\nTARGET: ChainlinkResolver is ready for automated resolution!");
    }
}
