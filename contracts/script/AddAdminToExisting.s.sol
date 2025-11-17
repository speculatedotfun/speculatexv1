// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/DirectCore.sol";

/**
 * @title AddAdminToExisting
 * @notice Script to add admin to an EXISTING DirectCore contract
 * @dev This requires the contract to already have the addAdmin function
 *      If the deployed contract doesn't have it, you need to redeploy
 */
contract AddAdminToExisting is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        
        address newAdmin = 0x654704a85211ECf9E021ff4D25a3a35533b99732;
        DirectCore core = DirectCore(0xFc648ebeb2118be2598eb6fc008D4c94b7Ba0Ba3);
        
        console.log("=== Adding Admin to Existing Contract ===");
        console.log("Contract:", address(core));
        console.log("Current admin:", core.admin());
        console.log("New admin address:", newAdmin);
        
        vm.startBroadcast(key);
        
        // Try to add admin - this will fail if contract doesn't have addAdmin function
        try core.addAdmin(newAdmin) {
            console.log("SUCCESS: Admin added!");
            console.log("New admin status:", core.admins(newAdmin));
        } catch {
            console.log("ERROR: Contract doesn't have addAdmin function.");
            console.log("You need to redeploy DirectCore with the updated code.");
            console.log("Run: forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast");
        }
        
        vm.stopBroadcast();
    }
}

