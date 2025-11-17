// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpeculateCore} from "../src/SpeculateCore.sol";
import {ChainlinkResolver} from "../src/ChainlinkResolver.sol";

/**
 * @title DeployAll
 * @notice Deploy Chainlink-enabled contracts (uses existing USDC and PositionToken)
 * @dev Set USDC_ADDRESS and TREASURY_ADDRESS in environment, or uses deployer as treasury
 */
contract DeployAll is Script {
    function run() external {
        string memory privateKeyStr = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey;
        if (bytes(privateKeyStr)[0] == bytes1("0") && bytes(privateKeyStr)[1] == bytes1("x")) {
            deployerPrivateKey = vm.parseUint(privateKeyStr);
        } else {
            string memory keyWithPrefix = string.concat("0x", privateKeyStr);
            deployerPrivateKey = vm.parseUint(keyWithPrefix);
        }
        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);
        console.log("\n=== DEPLOYING CHAINLINK CONTRACTS ===\n");
        console.log("Deployer address:", deployer);

        // Get existing USDC address from environment or use provided
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(usdcAddress != address(0), "USDC_ADDRESS not set in environment");
        console.log("Using existing USDC at:", usdcAddress);

        // Get treasury address (defaults to deployer)
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        console.log("Treasury address:", treasury);

        // Step 1: Deploy SpeculateCore (with Chainlink support)
        console.log("\n--- Step 1: Deploying SpeculateCore (with Chainlink) ---");
        SpeculateCore core = new SpeculateCore(usdcAddress, treasury);
        console.log("SpeculateCore deployed at:", address(core));

        // Step 2: Deploy ChainlinkResolver
        console.log("\n--- Step 2: Deploying ChainlinkResolver ---");
        ChainlinkResolver resolver = new ChainlinkResolver(address(core));
        console.log("ChainlinkResolver deployed at:", address(resolver));

        // Step 3: Configure SpeculateCore with resolver
        console.log("\n--- Step 3: Configuring SpeculateCore ---");
        core.setChainlinkResolver(address(resolver));
        console.log("Set ChainlinkResolver address in SpeculateCore");

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("USDC (existing):", usdcAddress);
        console.log("SpeculateCore:", address(core));
        console.log("ChainlinkResolver:", address(resolver));
        console.log("Treasury:", treasury);
        console.log("\nNext steps:");
        console.log("1. Save these addresses to your .env file:");
        console.log("   SPECULATE_CORE_ADDRESS=", address(core));
        console.log("   CHAINLINK_RESOLVER_ADDRESS=", address(resolver));
        console.log("2. Create markets using the CreateMarketWithChainlink script");
        console.log("3. Register upkeeps on Chainlink Automation");

        vm.stopBroadcast();
    }
}

