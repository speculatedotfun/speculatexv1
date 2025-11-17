// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";
import "../src/SpeculateCore.sol";

/**
 * @title DeployChainlinkResolver
 * @notice Deploy ChainlinkResolver and configure it with SpeculateCore
 */
contract DeployChainlinkResolver is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        console.log("\n=== DEPLOY CHAINLINK RESOLVER ===\n");
        console.log("Deployer:", deployer);

        // Get SpeculateCore address from environment
        // If not set, we'll deploy a new one
        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        
        // If core doesn't exist, deploy it first
        if (coreAddress == address(0)) {
            console.log("SpeculateCore address not provided, deploying new one...");
            address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
            require(usdcAddress != address(0), "USDC_ADDRESS not set");
            
            address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
            SpeculateCore newCore = new SpeculateCore(usdcAddress, treasury);
            coreAddress = address(newCore);
            console.log("New SpeculateCore deployed at:", coreAddress);
        }

        console.log("SpeculateCore:", coreAddress);

        // Deploy ChainlinkResolver
        console.log("\n--- Deploying ChainlinkResolver ---");
        ChainlinkResolver resolver = new ChainlinkResolver(coreAddress);
        console.log("ChainlinkResolver deployed at:", address(resolver));

        // Set resolver in core (requires admin role)
        console.log("\n--- Configuring SpeculateCore ---");
        SpeculateCore core = SpeculateCore(coreAddress);
        core.setChainlinkResolver(address(resolver));
        console.log("Resolver set in SpeculateCore");

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("ChainlinkResolver:", address(resolver));
        console.log("SpeculateCore:", address(core));
        console.log("\nNext steps:");
        console.log("1. Register markets with price feeds: resolver.registerMarket(marketId, priceFeedAddress)");
        console.log("2. Register upkeep on Chainlink Automation");
        console.log("3. Fund upkeep with LINK tokens");

        vm.stopBroadcast();
    }
}

