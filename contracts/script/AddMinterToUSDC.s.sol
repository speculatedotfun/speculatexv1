// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/**
 * @notice Script to add an admin as a minter on MockUSDC
 * @dev This allows the admin to mint USDC directly
 * Usage: forge script script/AddMinterToUSDC.s.sol:AddMinterToUSDC --rpc-url <rpc> --broadcast
 */
contract AddMinterToUSDC is Script {
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

        // Get addresses from environment or use defaults
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0x0E5cB1F812ce0402fdF0c9cee2E1FE3BF351a827));
        address adminToAdd = vm.envOr("ADMIN_ADDRESS", address(0x654704a85211ECf9E021ff4D25a3a35533b99732));
        
        MockUSDC usdc = MockUSDC(usdcAddr);
        
        console.log("USDC Address:", address(usdc));
        console.log("Adding minter:", adminToAdd);
        console.log("Calling addMinter...");
        
        usdc.addMinter(adminToAdd);
        
        console.log("Successfully added admin as minter on MockUSDC");
        console.log("Admin can now mint USDC directly");

        vm.stopBroadcast();
    }
}

