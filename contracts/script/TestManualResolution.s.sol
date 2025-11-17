// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";
import "../src/SpeculateCore.sol";

contract TestManualResolution is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        vm.startBroadcast(key);

        console.log("\n=== TESTING MANUAL RESOLUTION ===\n");

        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address resolverAddress = vm.envOr("CHAINLINK_RESOLVER_ADDRESS", address(0));

        require(coreAddress != address(0), "SPECULATE_CORE_ADDRESS not set");
        require(resolverAddress != address(0), "CHAINLINK_RESOLVER_ADDRESS not set");

        SpeculateCore core = SpeculateCore(coreAddress);
        ChainlinkResolver resolver = ChainlinkResolver(resolverAddress);

        console.log("Core:", coreAddress);
        console.log("Resolver:", resolverAddress);
        console.log("Owner:", resolver.owner());

        // Check upkeep first
        (bool upkeepNeeded, bytes memory performData) = resolver.checkUpkeep("");
        console.log("\nUpkeep needed:", upkeepNeeded);

        if (upkeepNeeded) {
            uint256 marketId = abi.decode(performData, (uint256));
            console.log("Market ID needing resolution:", marketId);

            // Get market details
            SpeculateCore.ResolutionConfig memory resolution = core.getMarketResolution(marketId);
            console.log("Oracle Type:", uint256(resolution.oracleType));
            console.log("Expiry:", resolution.expiryTimestamp);
            console.log("Target Value:", resolution.targetValue);
            console.log("Current time:", block.timestamp);

            // Check if expired
            if (block.timestamp >= resolution.expiryTimestamp) {
                console.log("Market is expired, attempting resolution...");

                // Try to perform upkeep
                try resolver.performUpkeep(performData) {
                    console.log("SUCCESS: Market resolved manually!");

                    // Check the result
                    SpeculateCore.ResolutionConfig memory resolved = core.getMarketResolution(marketId);
                    console.log("Market resolved:", resolved.isResolved);
                    console.log("Yes wins:", resolved.yesWins);
                } catch Error(string memory reason) {
                    console.log("FAILED: Resolution failed with reason:", reason);
                } catch {
                    console.log("FAILED: Resolution failed with unknown error");
                }
            } else {
                console.log("Market not yet expired");
            }
        } else {
            console.log("No upkeep needed at this time");
        }

        vm.stopBroadcast();
    }
}
