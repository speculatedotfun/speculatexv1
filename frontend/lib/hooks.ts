import { readContract } from 'wagmi/actions';
import { config } from './wagmi';
import { addresses } from './contracts';
import { formatUnits } from 'viem';
import { coreAbi } from './abis';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Get market count
export async function getMarketCount(): Promise<bigint> {
  const result = await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'marketCount',
    args: [],
  });
  return result as bigint;
}

// Get single market
export async function getMarket(id: bigint) {
  try {
    const result = await readContract(config, {
      address: addresses.core,
      abi: coreAbi,
      functionName: 'markets',
      args: [id],
    }) as any;

    const isObject = !!result && typeof result === 'object' && !Array.isArray(result) && 'yes' in result;

    const yes = (isObject ? result.yes : result?.[0]) as `0x${string}` | undefined;
    const no = (isObject ? result.no : result?.[1]) as `0x${string}` | undefined;
    const qYes = BigInt(isObject ? result.qYes ?? 0n : result?.[2] ?? 0n);
    const qNo = BigInt(isObject ? result.qNo ?? 0n : result?.[3] ?? 0n);
    const bE18 = BigInt(isObject ? result.bE18 ?? 0n : result?.[4] ?? 0n);
    const usdcVault = BigInt(isObject ? result.usdcVault ?? 0n : result?.[5] ?? 0n);
    const feeTreasuryBps = Number(isObject ? result.feeTreasuryBps ?? 0 : result?.[6] ?? 0);
    const feeVaultBps = Number(isObject ? result.feeVaultBps ?? 0 : result?.[7] ?? 0);
    const feeLpBps = Number(isObject ? result.feeLpBps ?? 0 : result?.[8] ?? 0);
    const status = Number(isObject ? result.status ?? 0 : result?.[9] ?? 0);
    const question = (isObject ? result.question : result?.[10]) ?? '';
    const lp = (isObject ? result.lp : result?.[11]) as `0x${string}` | undefined;
    const resolutionRaw = isObject ? result.resolution : result?.[12];
    const totalLpUsdc = BigInt(isObject ? result.totalLpUsdc ?? 0n : result?.[13] ?? 0n);
    const lpFeesUSDC = BigInt(isObject ? result.lpFeesUSDC ?? 0n : result?.[14] ?? 0n);

    const resolution = {
      expiryTimestamp: BigInt(resolutionRaw?.expiryTimestamp ?? resolutionRaw?.[0] ?? 0n),
      oracleType: Number(resolutionRaw?.oracleType ?? resolutionRaw?.[1] ?? 0),
      oracleAddress: (resolutionRaw?.oracleAddress ?? resolutionRaw?.[2] ?? ZERO_ADDRESS) as `0x${string}`,
      priceFeedId: (resolutionRaw?.priceFeedId ?? resolutionRaw?.[3] ?? '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`,
      targetValue: BigInt(resolutionRaw?.targetValue ?? resolutionRaw?.[4] ?? 0n),
      comparison: Number(resolutionRaw?.comparison ?? resolutionRaw?.[5] ?? 0),
      yesWins: Boolean(resolutionRaw?.yesWins ?? resolutionRaw?.[6] ?? false),
      isResolved: Boolean(resolutionRaw?.isResolved ?? resolutionRaw?.[7] ?? false),
    };

    const exists = !!yes && yes !== ZERO_ADDRESS;

    return {
      yes: yes ?? ZERO_ADDRESS,
      no: no ?? ZERO_ADDRESS,
      qYes,
      qNo,
      usdcVault,
      bE18,
      feeTreasuryBps,
      feeVaultBps,
      feeLpBps,
      totalFeeBps: feeTreasuryBps + feeVaultBps + feeLpBps,
      status,
      question,
      lp: lp ?? ZERO_ADDRESS,
      resolution,
      totalLpUsdc,
      lpFeesUSDC,
      exists,
    };
  } catch (error: any) {
    console.error('Error loading market:', error);
    // Return a minimal market object to prevent crashes
    return {
      yes: ZERO_ADDRESS,
      no: ZERO_ADDRESS,
      qYes: 0n,
      qNo: 0n,
      usdcVault: 0n,
      bE18: 0n,
      feeTreasuryBps: 0,
      feeVaultBps: 0,
      feeLpBps: 0,
      totalFeeBps: 0,
      status: 0,
      question: 'Market not found',
      lp: ZERO_ADDRESS,
      resolution: {
        expiryTimestamp: 0n,
        oracleType: 0,
        oracleAddress: ZERO_ADDRESS,
        priceFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        targetValue: 0n,
        comparison: 0,
        yesWins: false,
        isResolved: false,
      },
      totalLpUsdc: 0n,
      lpFeesUSDC: 0n,
      exists: false,
    };
  }
}

// Pricing helpers (contract exposes spot price in E6)
export async function getSpotPriceYesE6(marketId: bigint): Promise<bigint> {
  return await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'spotPriceYesE6',
    args: [marketId],
  }) as bigint;
}

export async function getSpotPriceNoE6(marketId: bigint): Promise<bigint> {
  return await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'spotPriceNoE6',
    args: [marketId],
  }) as bigint;
}

export async function getPriceYes(marketId: bigint): Promise<string> {
  const priceE6 = await getSpotPriceYesE6(marketId);
  return (Number(priceE6) / 1e6).toFixed(6);
}

export async function getPriceNo(marketId: bigint): Promise<string> {
  const priceE6 = await getSpotPriceNoE6(marketId);
  return (Number(priceE6) / 1e6).toFixed(6);
}

export async function getMarketState(id: bigint) {
  const [qYes, qNo, vault, b, pYesE6] = await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'getMarketState',
    args: [id],
  }) as [bigint, bigint, bigint, bigint, bigint];

  return {
    qYes,
    qNo,
    vault,
    b,
    priceYesE6: pYesE6,
  };
}

// Get market resolution config
export async function getMarketResolution(id: bigint) {
  try {
    const result = await readContract(config, {
      address: addresses.core,
      abi: coreAbi,
      functionName: 'getMarketResolution',
      args: [id],
    }) as any;
    
    return {
      expiryTimestamp: result.expiryTimestamp || result[0] || 0n,
      oracleType: result.oracleType !== undefined ? Number(result.oracleType) : (result[1] !== undefined ? Number(result[1]) : 0),
      oracleAddress: result.oracleAddress || result[2] || ZERO_ADDRESS,
      priceFeedId: result.priceFeedId || result[3] || '0x0000000000000000000000000000000000000000000000000000000000000000',
      targetValue: result.targetValue || result[4] || 0n,
      comparison: result.comparison !== undefined ? Number(result.comparison) : (result[5] !== undefined ? Number(result[5]) : 0),
      yesWins: result.yesWins !== undefined ? Boolean(result.yesWins) : (result[6] !== undefined ? Boolean(result[6]) : false),
      isResolved: result.isResolved !== undefined ? Boolean(result.isResolved) : (result[7] !== undefined ? Boolean(result[7]) : false),
    };
  } catch (error) {
    console.error('Error loading market resolution:', error);
    return {
      expiryTimestamp: 0n,
      oracleType: 0,
      oracleAddress: ZERO_ADDRESS,
      priceFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000',
      targetValue: 0n,
      comparison: 0,
      yesWins: false,
      isResolved: false,
    };
  }
}

const ADMIN_LOWERCASE = addresses.admin.toLowerCase();
const adminRoleCache = new Map<string, boolean>();

// Check if an address is an admin (SpeculateCore uses AccessControl)
export async function isAdmin(address: `0x${string}`): Promise<boolean> {
  if (!address) return false;

  const normalized = address.toLowerCase();

  if (normalized === ADMIN_LOWERCASE) {
    adminRoleCache.set(normalized, true);
    return true;
  }

  if (adminRoleCache.has(normalized)) {
    return adminRoleCache.get(normalized)!;
  }

  try {
    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const hasAdminRole = await readContract(config, {
      address: addresses.core,
      abi: coreAbi,
      functionName: 'hasRole',
      args: [DEFAULT_ADMIN_ROLE as `0x${string}`, address],
    }) as boolean;

    if (hasAdminRole) {
      adminRoleCache.set(normalized, true);
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('exceeds defined limit')) {
      console.error('Error checking admin status:', error);
    }
  }

  adminRoleCache.set(normalized, false);
  return false;
}

export async function getPendingLpFees(id: bigint, user: `0x${string}`) {
  if (!user || user === ZERO_ADDRESS) return 0n;
  return await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'pendingLpFees',
    args: [id, user],
  }) as bigint;
}

export async function getInvariantUsdc(id: bigint) {
  return await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'invariantUsdc',
    args: [id],
  }) as bigint;
}

export async function getLpResidualPot(id: bigint): Promise<bigint> {
  return await readContract(config, {
    address: addresses.core,
    abi: coreAbi,
    functionName: 'lpResidualUSDC',
    args: [id],
  }) as bigint;
}
