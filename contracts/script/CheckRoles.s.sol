// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SpeculateCore.sol";

contract CheckRoles is Script {
    function run() external view {
        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address adminAddress = 0x9D767E1a7D6650EEf1cEaa82841Eb553eDD6b76F;

        if (coreAddress == address(0)) {
            console.log("ERROR: SPECULATE_CORE_ADDRESS not set");
            return;
        }

        SpeculateCore core = SpeculateCore(coreAddress);

        bytes32 defaultAdminRole = 0x00;
        bytes32 marketCreatorRole = keccak256("MARKET_CREATOR_ROLE");

        console.log("Checking roles for admin address:", adminAddress);
        console.log("Core address:", coreAddress);
        console.log("");

        console.log("DEFAULT_ADMIN_ROLE:", core.hasRole(defaultAdminRole, adminAddress));
        console.log("MARKET_CREATOR_ROLE:", core.hasRole(marketCreatorRole, adminAddress));
        console.log("");

        console.log("Current market count:", core.marketCount());
    }
}
