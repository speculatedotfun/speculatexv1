// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SpeculateCore.sol";

/**
 * @title CreateMarketWithChainlink
 * @notice Create a market with Chainlink price feed resolution
 */
contract CreateMarketWithChainlink is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address creator = vm.addr(key);
        vm.startBroadcast(key);

        console.log("\n=== CREATE MARKET WITH CHAINLINK ===\n");

        address coreAddress = vm.envOr("SPECULATE_CORE_ADDRESS", address(0));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(coreAddress != address(0), "SPECULATE_CORE_ADDRESS not set");
        require(usdcAddress != address(0), "USDC_ADDRESS not set");

        SpeculateCore core = SpeculateCore(coreAddress);

        string memory question = "Will BTC be above $50,000?";
        uint256 expiryTimestamp = block.timestamp + 7 days;
        address btcPriceFeed = vm.envOr(
            "BTC_PRICE_FEED_ADDRESS",
            address(0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf)
        );
        uint256 targetValue = 50_000e8; // Chainlink feeds use 8 decimals

        console.log("Creator:", creator);
        console.log("Question:", question);
        console.log("Expiry:", expiryTimestamp);
        console.log("Price Feed:", btcPriceFeed);
        console.log("Target Value:", targetValue);

        uint256 initUsdc = 1_000e6; // 1000 USDC seed liquidity

        bytes32 feedId = keccak256(bytes("BTC/USD"));

        uint256 marketId = core.createMarket(
            question,
            "BTC Above 50k YES",
            "BTC50K-YES",
            "BTC Above 50k NO",
            "BTC50K-NO",
            initUsdc,
            expiryTimestamp,
            btcPriceFeed,
            feedId,
            targetValue,
            SpeculateCore.Comparison.Above
        );

        console.log("Market created with ID:", marketId);
        vm.stopBroadcast();
    }
}

