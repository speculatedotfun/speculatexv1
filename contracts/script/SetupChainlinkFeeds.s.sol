// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ChainlinkResolver.sol";

contract SetupChainlinkFeeds is Script {
    function run() external {
        string memory pkStr = vm.envString("PRIVATE_KEY");
        bytes memory bs = bytes(pkStr);
        uint256 key = (bs.length >= 2 && bs[0] == bytes1("0") && bs[1] == bytes1("x"))
            ? vm.parseUint(pkStr)
            : vm.parseUint(string(abi.encodePacked("0x", pkStr)));
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        console.log("\n=== SETTING UP CHAINLINK FEEDS ===\n");

        // Get ChainlinkResolver address
        address resolverAddress = vm.envOr("CHAINLINK_RESOLVER_ADDRESS", address(0));
        require(resolverAddress != address(0), "CHAINLINK_RESOLVER_ADDRESS not set");

        ChainlinkResolver resolver = ChainlinkResolver(resolverAddress);

        console.log("ChainlinkResolver:", resolverAddress);
        console.log("Owner:", resolver.owner());
        console.log("Core:", address(resolver.core()));

        // BSC Testnet Chainlink feeds (verified working addresses)
        address btcFeed = 0x5741306c21795FdCBb9b265Ea0255F499DFe515C;  // BTC/USD
        address ethFeed = 0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7;  // ETH/USD
        address bnbFeed = 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526;  // BNB/USD

        // Register global feeds
        console.log("\n--- Registering BTC/USD feed ---");
        resolver.setGlobalFeed(keccak256(bytes("BTC/USD")), btcFeed);
        console.log("BTC/USD feed registered");

        console.log("\n--- Registering ETH/USD feed ---");
        resolver.setGlobalFeed(keccak256(bytes("ETH/USD")), ethFeed);
        console.log("ETH/USD feed registered");

        console.log("\n--- Registering BNB/USD feed ---");
        resolver.setGlobalFeed(keccak256(bytes("BNB/USD")), bnbFeed);
        console.log("BNB/USD feed registered");

        console.log("\n=== FEED SETUP COMPLETE ===\n");

        // Verify feeds are set
        console.log("Verifying feeds:");
        console.log("BTC/USD:", resolver.globalFeeds(keccak256(bytes("BTC/USD"))));
        console.log("ETH/USD:", resolver.globalFeeds(keccak256(bytes("ETH/USD"))));
        console.log("BNB/USD:", resolver.globalFeeds(keccak256(bytes("BNB/USD"))));

        vm.stopBroadcast();
    }
}
