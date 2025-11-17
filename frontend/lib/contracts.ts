export const addresses = {
  core: (process.env.NEXT_PUBLIC_CORE_ADDRESS || '0x8f93aaCdb8aCB85B1A55ce8f3538C0848797A595') as `0x${string}`,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0xdB8b30B71EA38948682e35bce84431Eb0e7c9f1F') as `0x${string}`,
  admin: (process.env.NEXT_PUBLIC_ADMIN_ADDRESS || '0x9D767E1a7D6650EEf1cEaa82841Eb553eDD6b76F') as `0x${string}`,
  chainlinkResolver: (process.env.NEXT_PUBLIC_CHAINLINK_RESOLVER_ADDRESS || '0x09A673026CcB319788857af309dfdFa97470D14b') as `0x${string}`,
};

export const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '97');

