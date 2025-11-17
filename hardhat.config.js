require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const { MAINNET_RPC_URL, GOERLI_RPC_URL, SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

const sharedAccounts = PRIVATE_KEY ? [PRIVATE_KEY] : undefined;

const withAccounts = (config) =>
  sharedAccounts ? { ...config, accounts: sharedAccounts } : config;

/**
 * @type {import("hardhat/config").HardhatUserConfig}
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    root: ".",
    sources: "contracts/src",
    tests: "contracts/test",
    cache: "contracts/cache/hardhat",
    artifacts: "contracts/artifacts",
  },
  networks: (() => {
    const configs = {
      hardhat: {},
      mainnet: withAccounts({
        url: MAINNET_RPC_URL ?? "https://eth.llamarpc.com",
      }),
    };

    if (SEPOLIA_RPC_URL) {
      configs.sepolia = withAccounts({ url: SEPOLIA_RPC_URL });
    }

    if (GOERLI_RPC_URL) {
      configs.goerli = withAccounts({ url: GOERLI_RPC_URL });
    }

    return configs;
  })(),
};

