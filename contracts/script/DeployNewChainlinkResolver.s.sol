// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";
import "../src/SpeculateCore.sol";

contract DeployNewChainlinkResolver is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        console.log("\n=== DEPLOYING NEW CHAINLINK RESOLVER ===\n");
        console.log("Deployer address:", deployer);

        // Get existing SpeculateCore address
        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        require(coreAddress != address(0), "SPECULATE_CORE_ADDRESS not set");

        console.log("Using existing SpeculateCore at:", coreAddress);

        // Deploy new ChainlinkResolver (you will be the owner)
        console.log("\n--- Deploying ChainlinkResolver ---");
        ChainlinkResolver resolver = new ChainlinkResolver(coreAddress);
        console.log("New ChainlinkResolver deployed at:", address(resolver));

        // Connect resolver to core (requires admin role)
        console.log("\n--- Connecting to SpeculateCore ---");
        SpeculateCore core = SpeculateCore(coreAddress);

        // Check if deployer has admin role
        if (core.hasRole(0x00, deployer)) {
            core.setChainlinkResolver(address(resolver));
            console.log("SUCCESS: Connected resolver to core");
        } else {
            console.log("WARNING: You don't have admin role on SpeculateCore");
            console.log("You need to manually call: core.setChainlinkResolver(", address(resolver), ")");
        }

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("New ChainlinkResolver:", address(resolver));
        console.log("Owner:", resolver.owner());
        console.log("Connected to Core:", address(resolver.core()));

        console.log("\nNext steps:");
        console.log("1. Update your .env files with: CHAINLINK_RESOLVER_ADDRESS=", address(resolver));
        console.log("2. Run SetupChainlinkFeeds.s.sol to register feeds");
        console.log("3. Create markets using CreateMarketWithChainlink.s.sol");
        console.log("4. Set up Chainlink Automation");

        vm.stopBroadcast();
    }
}
