// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpeculateCore} from "../src/SpeculateCore.sol";

/**
 * @title DeployCoreOnly
 * @notice Deploy only SpeculateCore contract (uses existing USDC)
 */
contract DeployCoreOnly is Script {
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
        console.log("\n=== DEPLOYING SPECULATECORE ===\n");
        console.log("Deployer address:", deployer);

        // Get existing USDC address from environment
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(usdcAddress != address(0), "USDC_ADDRESS not set in environment");
        console.log("Using existing USDC at:", usdcAddress);

        // Get treasury address (defaults to deployer)
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        console.log("Treasury address:", treasury);

        // Deploy SpeculateCore (with redeem function for 1:1 USDC)
        console.log("\n--- Deploying SpeculateCore ---");
        SpeculateCore core = new SpeculateCore(usdcAddress, treasury);
        console.log("SpeculateCore deployed at:", address(core));

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("USDC (existing):", usdcAddress);
        console.log("SpeculateCore:", address(core));
        console.log("Treasury:", treasury);
        console.log("\nSave this address to your .env file:");
        console.log("   SPECULATE_CORE_ADDRESS=", address(core));

        vm.stopBroadcast();
    }
}

