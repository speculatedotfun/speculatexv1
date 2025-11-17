// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/DirectCore.sol";

/**
 * @title AddAdmin
 * @notice Script to add a new admin to the DirectCore contract
 */
contract AddAdmin is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        
        address newAdmin = 0x654704a85211ECf9E021ff4D25a3a35533b99732;
        DirectCore core = DirectCore(0xFc648ebeb2118be2598eb6fc008D4c94b7Ba0Ba3);
        
        console.log("Current admin:", core.admin());
        console.log("Adding new admin:", newAdmin);
        console.log("Is already admin?", core.admins(newAdmin));
        
        vm.startBroadcast(key);
        
        core.addAdmin(newAdmin);
        
        console.log("Admin added successfully!");
        console.log("New admin status:", core.admins(newAdmin));
        
        vm.stopBroadcast();
    }
}

