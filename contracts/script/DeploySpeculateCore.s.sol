// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpeculateCore} from "../src/SpeculateCore.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeploySpeculateCore is Script {
    function run() external {
        string memory privateKeyStr = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey;
        bytes memory pkBytes = bytes(privateKeyStr);
        if (pkBytes.length > 1 && pkBytes[0] == bytes1("0") && pkBytes[1] == bytes1("x")) {
            deployerPrivateKey = vm.parseUint(privateKeyStr);
        } else {
            deployerPrivateKey = vm.parseUint(string.concat("0x", privateKeyStr));
        }

        vm.startBroadcast(deployerPrivateKey);
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        address treasury = deployer;
        SpeculateCore core = new SpeculateCore(address(usdc), treasury);
        console.log("SpeculateCore deployed at:", address(core));

        usdc.setSpeculateCore(address(core));
        console.log("SpeculateCore assigned on MockUSDC");

        vm.stopBroadcast();
    }
}

