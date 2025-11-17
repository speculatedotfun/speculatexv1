const { ethers } = require("hardhat");
const coreAbi = require("../../SpeculateCore_ABI_FULL.json");

/**
 * Usage:
 * BUY_AMOUNT defaults to 10 USDC.
 * npx hardhat run --network <network> contracts/scripts/debug/testBuy.js
 */
async function main() {
  const coreAddress = process.env.CORE_ADDRESS ?? "0xc924E4727f5a0372dF6e89c6dC35689970feAd44";
  const marketId = parseInt(process.env.MARKET_ID ?? "1", 10);
  const buyAmount = ethers.utils.parseUnits(process.env.BUY_AMOUNT ?? "10", 6);
  const minOut = ethers.BigNumber.from(process.env.MIN_OUT ?? "0");

  console.log("Estimating buyYes gas");
  console.log("Core:", coreAddress);
  console.log("Market:", marketId);
  console.log("USDC in:", ethers.utils.formatUnits(buyAmount, 6));
  console.log("Min out:", minOut.toString());

  const [signer] = await ethers.getSigners();
  const core = new ethers.Contract(coreAddress, coreAbi, signer);

  try {
    const gasEstimate = await core.estimateGas.buyYes(marketId, buyAmount, minOut);
    console.log("✅ Gas estimate:", gasEstimate.toString());
  } catch (error) {
    console.log("❌ ERROR estimating gas");
    if (error.reason) {
      console.log("Reason:", error.reason);
    }
    if (error.error && error.error.message) {
      console.log("Message:", error.error.message);
    } else if (error.message) {
      console.log("Message:", error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

