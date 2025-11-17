const { ethers } = require("hardhat");
const coreAbi = require("../../SpeculateCore_ABI_FULL.json");

/**
 * Usage:
 * npx hardhat run --network <network> contracts/scripts/debug/checkTreasury.js
 */
async function main() {
  const coreAddress = process.env.CORE_ADDRESS ?? "0xc924E4727f5a0372dF6e89c6dC35689970feAd44";
  const marketId = parseInt(process.env.MARKET_ID ?? "1", 10);

  console.log("Using SpeculateCore at:", coreAddress);
  console.log("Inspecting market:", marketId);

  const provider = ethers.provider;
  const core = new ethers.Contract(coreAddress, coreAbi, provider);

  const treasuryAddress = await core.treasury();
  console.log("Treasury address:", treasuryAddress);

  if (treasuryAddress === ethers.constants.AddressZero) {
    console.log("❌ ERROR: Treasury is zero address!");
  } else {
    console.log("✅ Treasury address is set");
  }

  const market = await core.markets(marketId);
  console.log("\nMarket exists:", market.exists);
  console.log("Market status:", market.status, "(0=Active, 1=Paused, 2=Resolved)");
  console.log("Fee treasury bps:", market.feeTreasuryBps.toString());
  console.log("Fee LP bps:", market.feeLpBps.toString());

  if (market.lp === ethers.constants.AddressZero) {
    console.log("⚠️  LP address is zero.");
  } else {
    console.log("LP address:", market.lp);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

