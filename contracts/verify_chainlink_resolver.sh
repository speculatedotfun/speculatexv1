#!/bin/bash
# Verify ChainlinkResolver on BSCScan Testnet

# Contract address
CONTRACT="0x300286753A4312425705dB77c4194B9a79BDAB22"

# Constructor argument (SpeculateCore address)
CONSTRUCTOR_ARGS="0x0000000000000000000000004b78cfd721e474d4b521b08caeec95dec7feead6"

# Get BSCScan API key from environment or prompt
if [ -z "$BSCSCAN_API_KEY" ]; then
    echo "Please set BSCSCAN_API_KEY environment variable"
    echo "Get your API key from: https://testnet.bscscan.com/myapikey"
    exit 1
fi

echo "Verifying ChainlinkResolver contract..."
echo "Contract: $CONTRACT"
echo "Constructor args: $CONSTRUCTOR_ARGS"
echo ""

forge verify-contract $CONTRACT \
  src/ChainlinkResolver.sol:ChainlinkResolver \
  --chain bsc-testnet \
  --etherscan-api-key $BSCSCAN_API_KEY \
  --constructor-args $CONSTRUCTOR_ARGS \
  --compiler-version 0.8.24

echo ""
echo "Verification complete! Check: https://testnet.bscscan.com/address/$CONTRACT#code"

