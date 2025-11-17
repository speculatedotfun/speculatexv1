// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import {SpeculateCore} from "../src/SpeculateCore.sol";

contract SetTreasury is Script {
    function run() external {
        string memory pk = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pk);
        uint256 deployerKey = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pk)
            : vm.parseUint(string(abi.encodePacked("0x", pk)));

        address coreAddr = vm.envAddress("SPECULATE_CORE_ADDRESS");
        address treasuryAddr = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);
        SpeculateCore(coreAddr).setTreasury(treasuryAddr);
        vm.stopBroadcast();

        console2.log("Updated core treasury to:", treasuryAddr);
    }
}


