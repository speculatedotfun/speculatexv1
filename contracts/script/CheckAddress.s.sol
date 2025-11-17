// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

contract CheckAddress is Script {
    function run() external view {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address derived = vm.addr(key);

        console.log("Private key:", pkStr);
        console.log("Derived address:", derived);
        console.log("ChainlinkResolver owner should be: 0xbd0e87A678f3D53a27D1bb186cfc8fd465433554");
    }
}
