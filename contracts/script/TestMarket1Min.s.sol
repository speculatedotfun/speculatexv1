// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SpeculateCore.sol";

contract TestMarket1Min is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address creator = vm.addr(key);
        vm.startBroadcast(key);

        console.log("\n=== CREATING 1-MINUTE TEST MARKET ===\n");

        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(coreAddress != address(0), "SPECULATE_CORE_ADDRESS not set");
        require(usdcAddress != address(0), "USDC_ADDRESS not set");

        SpeculateCore core = SpeculateCore(coreAddress);

        // 1-minute expiry for live testing
        string memory question = "Will BTC be above $95,000 in 1 minute?";
        uint256 expiryTimestamp = block.timestamp + 1 minutes;
        bytes32 feedId = keccak256(bytes("BTC/USD"));
        uint256 targetValue = 95_000e8; // Current BTC price is ~$95k

        console.log("Creator:", creator);
        console.log("Question:", question);
        console.log("Expiry:", expiryTimestamp, "(in 1 minute)");
        console.log("Target Value: $95,000");

        uint256 initUsdc = 1_000e6; // 1000 USDC seed liquidity

        uint256 marketId = core.createMarket(
            question,
            "BTC Above 95k YES",
            "BTC95K-YES",
            "BTC Above 95k NO",
            "BTC95K-NO",
            initUsdc,
            expiryTimestamp,
            address(0), // oracle address (will use global feed)
            feedId,
            targetValue,
            SpeculateCore.Comparison.Above
        );

        console.log("\nMarket created with ID:", marketId);
        console.log("Will expire in ~1 minute and resolve automatically!");
        console.log("Expected result: YES (BTC is currently above $95k)");

        vm.stopBroadcast();
    }
}
