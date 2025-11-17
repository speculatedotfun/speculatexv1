// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";

contract TestChainlinkResolver is Script {
    function run() external {
        console.log("\n=== TESTING CHAINLINK RESOLVER ===\n");

        // Test feed ID generation
        bytes32 btcFeedId = keccak256(bytes("BTC/USD"));
        bytes32 ethFeedId = keccak256(bytes("ETH/USD"));

        console.log("BTC/USD feed ID:", uint256(btcFeedId));
        console.log("ETH/USD feed ID:", uint256(ethFeedId));

        // Test resolver functions (this would need a deployed resolver)
        console.log("\nTo test the actual resolver:");
        console.log("1. Deploy ChainlinkResolver");
        console.log("2. Set global feeds:");
        console.log("   resolver.setGlobalFeed(keccak256('BTC/USD'), btcFeedAddress)");
        console.log("   resolver.setGlobalFeed(keccak256('ETH/USD'), ethFeedAddress)");
        console.log("3. Create markets using CreateMarketWithChainlink script");
        console.log("4. Test upkeep functions");

        // Show expected BSC testnet feed addresses
        console.log("\nBSC Testnet Chainlink Feeds:");
        console.log("BTC/USD: 0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf");
        console.log("ETH/USD: 0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7");
        console.log("BNB/USD: 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526");
    }
}
