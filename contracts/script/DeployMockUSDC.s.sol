// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SpeculateCore} from "../src/SpeculateCore.sol";

/**
 * @title DeployMockUSDC
 * @notice Deploy a new MockUSDC and optionally configure it with SpeculateCore
 */
contract DeployMockUSDC is Script {
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
        console.log("\n=== DEPLOYING MOCKUSDC ===\n");
        console.log("Deployer address:", deployer);

        // Deploy MockUSDC
        console.log("\n--- Deploying MockUSDC ---");
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // Optionally configure with SpeculateCore
        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        if (coreAddress != address(0)) {
            console.log("\n--- Configuring MockUSDC with SpeculateCore ---");
            usdc.setSpeculateCore(coreAddress);
            console.log("Set SpeculateCore address:", coreAddress);
        }

        // Mint some USDC to deployer for testing
        uint256 mintAmount = 1000000e6; // 1M USDC
        console.log("\n--- Minting USDC to deployer ---");
        usdc.mint(deployer, mintAmount);
        console.log("Minted", mintAmount / 1e6, "USDC to deployer");
        console.log("Deployer USDC balance:", usdc.balanceOf(deployer) / 1e6);

        console.log("\n=== DEPLOYMENT COMPLETE ===\n");
        console.log("MockUSDC address:", address(usdc));
        console.log("\nNext steps:");
        console.log("1. Update USDC_ADDRESS in your .env file:", address(usdc));
        console.log("2. Redeploy SpeculateCore with the new USDC address");
        console.log("3. Or use the existing SpeculateCore and approve it to spend USDC");

        vm.stopBroadcast();
    }
}

