# Verify ChainlinkResolver on BSCScan Testnet (PowerShell)

# Contract address
$CONTRACT = "0x300286753A4312425705dB77c4194B9a79BDAB22"

# Constructor argument (SpeculateCore address)
$CONSTRUCTOR_ARGS = "0x0000000000000000000000004b78cfd721e474d4b521b08caeec95dec7feead6"

# Get BSCScan API key from environment
if (-not $env:BSCSCAN_API_KEY) {
    Write-Host "Please set BSCSCAN_API_KEY environment variable"
    Write-Host "Get your API key from: https://testnet.bscscan.com/myapikey"
    Write-Host ""
    Write-Host "Set it with: `$env:BSCSCAN_API_KEY = 'your-api-key'"
    exit 1
}

Write-Host "Verifying ChainlinkResolver contract..."
Write-Host "Contract: $CONTRACT"
Write-Host "Constructor args: $CONSTRUCTOR_ARGS"
Write-Host ""

$forgePath = "C:\Users\Almog\.foundry\bin\forge.exe"

& $forgePath verify-contract $CONTRACT `
  src/ChainlinkResolver.sol:ChainlinkResolver `
  --chain bsc-testnet `
  --etherscan-api-key $env:BSCSCAN_API_KEY `
  --constructor-args $CONSTRUCTOR_ARGS `
  --compiler-version 0.8.24

Write-Host ""
Write-Host "Verification complete! Check: https://testnet.bscscan.com/address/$CONTRACT#code"

