// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {Treasury} from "../src/Treasury.sol";

contract DeployTreasury is Script {
    function run() external returns (Treasury treasury) {
        string memory pk = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pk);
        uint256 deployerKey = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pk)
            : vm.parseUint(string(abi.encodePacked("0x", pk)));
        address owner = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        treasury = new Treasury(owner);
        vm.stopBroadcast();

        console2.log("Treasury deployed at:", address(treasury));
        console2.log("Owner:", owner);
    }
}


