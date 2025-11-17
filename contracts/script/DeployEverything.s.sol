// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SpeculateCore} from "../src/SpeculateCore.sol";
import {ChainlinkResolver} from "../src/ChainlinkResolver.sol";

/**
 * @title DeployEverything
 * @notice Deploy everything from scratch: MockUSDC, SpeculateCore, and ChainlinkResolver
 */
contract DeployEverything is Script {
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
        console.log("\n=== DEPLOYING EVERYTHING FROM SCRATCH ===\n");
        console.log("Deployer address:", deployer);

        // Step 1: Deploy MockUSDC
        console.log("\n--- Step 1: Deploying MockUSDC ---");
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // Step 2: Deploy SpeculateCore with the new USDC
        console.log("\n--- Step 2: Deploying SpeculateCore ---");
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        console.log("Treasury address:", treasury);
        SpeculateCore core = new SpeculateCore(address(usdc), treasury);
        console.log("SpeculateCore deployed at:", address(core));

        // Step 3: Configure MockUSDC with SpeculateCore (so admins can mint)
        console.log("\n--- Step 3: Configuring MockUSDC with SpeculateCore ---");
        usdc.setSpeculateCore(address(core));
        console.log("Set SpeculateCore address in MockUSDC");

        // Step 4: Deploy ChainlinkResolver
        console.log("\n--- Step 4: Deploying ChainlinkResolver ---");
        ChainlinkResolver resolver = new ChainlinkResolver(address(core));
        console.log("ChainlinkResolver deployed at:", address(resolver));

        // Step 5: Configure SpeculateCore with resolver
        console.log("\n--- Step 5: Configuring SpeculateCore ---");
        core.setChainlinkResolver(address(resolver));
        console.log("Set ChainlinkResolver address in SpeculateCore");

        // Step 6: Mint USDC to deployer for testing (10M USDC)
        console.log("\n--- Step 6: Minting USDC to deployer ---");
        uint256 mintAmount = 10_000_000e6; // 10M USDC
        usdc.mint(deployer, mintAmount);
        console.log("Minted", mintAmount / 1e6, "USDC to deployer");
        console.log("Deployer USDC balance:", usdc.balanceOf(deployer) / 1e6);

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("MockUSDC:", address(usdc));
        console.log("SpeculateCore:", address(core));
        console.log("ChainlinkResolver:", address(resolver));
        console.log("Treasury:", treasury);
        console.log("\nNext steps:");
        console.log("1. Save these addresses to your .env file:");
        console.log("   USDC_ADDRESS=", address(usdc));
        console.log("   SPECULATE_CORE_ADDRESS=", address(core));
        console.log("   CHAINLINK_RESOLVER_ADDRESS=", address(resolver));
        console.log("   TREASURY_ADDRESS=", treasury);
        console.log("2. Approve SpeculateCore to spend your USDC:");
        console.log("   usdc.approve(", address(core), ", amount)");
        console.log("3. Create markets using the CreateMarketWithChainlink script");
        console.log("4. Register upkeeps on Chainlink Automation");

        vm.stopBroadcast();
    }
}

