// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/interfaces/AggregatorV3Interface.sol";

contract CheckChainlinkFeeds is Script {
    function run() external view {
        console.log("\n=== CHECKING CHAINLINK FEED ADDRESSES ===\n");

        // BSC Testnet Chainlink feeds
        address[] memory feeds = new address[](3);
        string[] memory names = new string[](3);

        feeds[0] = 0x5741306c21795FdCBb9b265Ea0255F499DFe515C;  // BTC/USD
        feeds[1] = 0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7;  // ETH/USD
        feeds[2] = 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526;  // BNB/USD

        names[0] = "BTC/USD";
        names[1] = "ETH/USD";
        names[2] = "BNB/USD";

        for (uint i = 0; i < feeds.length; i++) {
            console.log(names[i], "at", feeds[i]);

            try AggregatorV3Interface(feeds[i]).decimals() returns (uint8 decimals) {
                console.log("  Decimals:", decimals);
                console.log("  Description:", AggregatorV3Interface(feeds[i]).description());
                console.log("  Version:", AggregatorV3Interface(feeds[i]).version());

                try AggregatorV3Interface(feeds[i]).latestRoundData() returns (
                    uint80 roundId,
                    int256 answer,
                    uint256 startedAt,
                    uint256 updatedAt,
                    uint80 answeredInRound
                ) {
                    console.log("  Latest price:", uint256(answer));
                    console.log("  Updated at:", updatedAt);
                    console.log("  SUCCESS: WORKING");
                } catch {
                    console.log("  ERROR: Cannot get price data");
                }
            } catch {
                console.log("  ERROR: Not a valid feed contract");
            }
            console.log("");
        }
    }
}
