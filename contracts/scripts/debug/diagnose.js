const { ethers } = require("hardhat");
const coreAbi = require("../../SpeculateCore_ABI_FULL.json");

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
];

/**
 * Usage:
 * npx hardhat run --network <network> contracts/scripts/debug/diagnose.js
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const coreAddress = process.env.CORE_ADDRESS ?? "0xc924E4727f5a0372dF6e89c6dC35689970feAd44";
  const marketId = parseInt(process.env.MARKET_ID ?? "1", 10);

  console.log("=== Diagnosis ===");
  console.log("Using signer:", signer.address);
  console.log("SpeculateCore:", coreAddress);
  console.log("Market ID:", marketId);

  const core = new ethers.Contract(coreAddress, coreAbi, signer);

  // 1. Treasury
  const treasury = await core.treasury();
  console.log("\n1. Treasury:", treasury);
  console.log("   Is zero?", treasury === ethers.constants.AddressZero);

  // 2. Market details
  try {
    const market = await core.markets(marketId);
    console.log("\n2. Market Details:");
    console.log("   Exists:", market.exists);
    console.log("   Status:", market.status, "(0=Active, 1=Paused, 2=Resolved)");
    console.log("   LP:", market.lp);
    console.log("   Treasury fee (bps):", market.feeTreasuryBps.toString());
    console.log("   Vault fee (bps):", market.feeVaultBps.toString());
    console.log("   LP fee (bps):", market.feeLpBps.toString());
    console.log("   USDC vault:", ethers.utils.formatUnits(market.usdcVault, 6));
    console.log("   bE18:", market.bE18.toString());
  } catch (error) {
    console.log("\n2. ERROR reading market:", error.message);
  }

  // 3. Price
  try {
    const priceYes = await core.getPriceYes(marketId);
    console.log("\n3. Yes price (1e18):", priceYes.toString());
  } catch (error) {
    console.log("\n3. ERROR getting price:", error.message);
  }

  // 4. USDC info
  const usdcAddress = await core.usdc();
  const usdc = new ethers.Contract(usdcAddress, erc20Abi, signer);
  const balance = await usdc.balanceOf(signer.address);
  const allowance = await usdc.allowance(signer.address, coreAddress);

  console.log("\n4. Signer USDC:");
  console.log("   Token:", usdcAddress);
  console.log("   Balance:", ethers.utils.formatUnits(balance, 6));
  console.log("   Allowance:", ethers.utils.formatUnits(allowance, 6));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

