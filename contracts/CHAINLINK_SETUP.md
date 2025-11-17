# Chainlink Automation Setup Guide

## Overview
Register your `ChainlinkResolver` contract with Chainlink Automation so it can automatically check and resolve markets.

## Contract Information
- **ChainlinkResolver Address**: `0x09A673026CcB319788857af309dfdFa97470D14b`
- **Network**: BSC Testnet (Chain ID: 97)
- **Contract Interface**: `AutomationCompatibleInterface`

## Step-by-Step Registration

### 1. Access Chainlink Automation
- Go to: https://automation.chain.link/
- Connect your wallet (MetaMask or other)
- Switch to **BSC Testnet** network

### 2. Register New Upkeep
1. Click **"Register New Upkeep"** or **"Create Upkeep"**
2. Select **"Custom Logic"** (not "Conditional" or "Log Trigger")

### 3. Configure Upkeep Details

#### Target Contract
- **Contract Address**: `0x09A673026CcB319788857af309dfdFa97470D14b`
- **Network**: BSC Testnet

#### Check Data (Optional)
- You can leave this **empty** (0x)
- Or encode a starting market index: `abi.encode(uint256(1))`
- The contract uses a persistent cursor, so empty is fine

#### Gas Limit
- Recommended: **500,000** gas
- Maximum per upkeep execution
- Adjust based on your needs

#### Starting Balance
- Minimum: **5 LINK** (for BSC Testnet)
- Recommended: **10-20 LINK** for testing
- LINK is consumed each time upkeep runs

### 4. Fund Your Upkeep
- You'll need **LINK tokens** on BSC Testnet
- Get testnet LINK from: https://faucets.chain.link/
- Fund the upkeep with at least 5 LINK

### 5. Review and Register
- Review all settings
- Confirm the transaction
- Wait for confirmation

## After Registration

### View Your Upkeep
- You'll get an **Upkeep ID**
- View it in the Chainlink Automation dashboard
- Monitor execution history and balance

### Register Price Feeds (Before Creating Markets)
Before creating markets, you need to register the Chainlink price feeds:

```solidity
// Example: Register BTC/USD feed
bytes32 btcFeedId = keccak256("BTC/USD");
address btcPriceFeed = 0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf; // BSC Testnet BTC/USD
resolver.setGlobalFeed(btcFeedId, btcPriceFeed);

// Example: Register ETH/USD feed  
bytes32 ethFeedId = keccak256("ETH/USD");
address ethPriceFeed = 0x143db3CEEfbdfe5631aDD3E50f7614B6ba9BAE8; // BSC Testnet ETH/USD
resolver.setGlobalFeed(ethFeedId, ethPriceFeed);
```

### Common BSC Testnet Price Feeds
- **BTC/USD**: `0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf`
- **ETH/USD**: `0x143db3CEEfbdfe5631aDD3E50f7614B6ba9BAE8`
- **BNB/USD**: `0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526`
- **USDT/USD**: `0xEca2605f0BCF2BA5966372C99837b1F182d3D620`

## Testing Your Setup

### Manual Test (Before Automation)
You can manually test the resolver:

```solidity
// Check if upkeep is needed
(bool upkeepNeeded, bytes memory performData) = resolver.checkUpkeep("");

// If upkeep is needed, perform it (only callable by Chainlink Automation)
// resolver.performUpkeep(performData);
```

### Monitor Automation
- Check the Chainlink Automation dashboard regularly
- Monitor LINK balance (top up when low)
- Check execution logs for any errors

## Troubleshooting

### Upkeep Not Running
- Check LINK balance (needs at least 5 LINK)
- Verify contract address is correct
- Ensure contract is deployed and verified
- Check if there are markets that need resolution

### Feed Not Found Errors
- Make sure you've registered the price feed using `setGlobalFeed()`
- Verify the `priceFeedId` matches when creating markets
- Check that the feed address is correct for BSC Testnet

### Gas Issues
- Increase gas limit in upkeep settings
- Check if contract execution is failing
- Review gas usage in execution logs

## Important Notes

1. **LINK Balance**: Keep your upkeep funded with LINK tokens
2. **Feed Registration**: Register all price feeds before creating markets
3. **Market Creation**: When creating markets, use the same `priceFeedId` that you registered
4. **Owner Functions**: Only the owner can register feeds (deployer address)

## Quick Reference

**ChainlinkResolver Contract**: `0x09A673026CcB319788857af309dfdFa97470D14b`

**Key Functions**:
- `checkUpkeep(bytes calldata checkData)` - Called by Chainlink Automation
- `performUpkeep(bytes calldata performData)` - Called by Chainlink Automation
- `setGlobalFeed(bytes32 feedId, address feedAddress)` - Register price feeds (owner only)

**Example Feed Registration**:
```javascript
// In your frontend or script
const resolver = new ethers.Contract(
  "0x09A673026CcB319788857af309dfdFa97470D14b",
  resolverABI,
  signer
);

// Register BTC/USD feed
const btcFeedId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BTC/USD"));
await resolver.setGlobalFeed(btcFeedId, "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf");
```

