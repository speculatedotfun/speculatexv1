// Market utility functions
import { formatUnits } from 'viem';
import type { PricePoint } from './priceHistory/types';

// Helper function to format price in cents
export const formatPriceInCents = (price: number): string => {
  if (!Number.isFinite(price)) return '—';
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }
  const cents = price * 100;
  const formatted = cents.toFixed(1).replace(/\.0$/, '');
  return `${formatted}¢`;
};

export const getAssetLogo = (question?: string): string => {
  if (!question) return '/logos/default.png';
  const q = question.toLowerCase();
  if (/\baster\b/.test(q)) return '/logos/ASTER_solana.png';
  if (/\bbtc\b|\bbitcoin\b/.test(q)) return '/logos/BTC_ethereum.png';
  if (/\beth\b|\bethereum\b/.test(q)) return '/logos/ETH_ethereum.png';
  if (/\bsol\b|\bsolana\b/.test(q)) return '/logos/SOL_solana.png';
  if (/\bxrp\b|\bripple\b/.test(q)) return '/logos/XRP_ethereum.png';
  if (/\bbnb\b|\bbinance\b/.test(q)) return '/logos/BNB_bsc.png';
  if (/\bada\b|\bcardano\b/.test(q)) return '/logos/ADA_ethereum.png';
  if (/\batom\b|\bcosmos\b/.test(q)) return '/logos/ATOM_ethereum.png';
  if (/\bdai\b/.test(q)) return '/logos/DAI_ethereum.png';
  if (/\busdt\b|\btether\b/.test(q)) return '/logos/USDT_ethereum.png';
  return '/logos/default.png';
};

export const absString = (value: string) =>
  value.startsWith('-') ? value.slice(1) : value;

export const toBigInt = (value: unknown): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      return BigInt(value);
    }
    return BigInt(value);
  }
  throw new TypeError(`Unable to convert value to bigint: ${String(value)}`);
};

export const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'bigint') return value !== 0n;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return Boolean(value);
};

export const derivePrices = (priceYesValue: number) => {
  const clampedYes = Math.max(0, Math.min(1, priceYesValue));
  return {
    priceYes: clampedYes,
    priceNo: Math.max(0, Math.min(1, 1 - clampedYes)),
  };
};

// Add seed point to price history
export const withSeedPoint = (
  points: PricePoint[],
  seedPoint: PricePoint
): PricePoint[] => {
  const normalized = Array.isArray(points) ? [...points] : [];
  const seedTxHash = seedPoint.txHash ?? 'seed';
  const withoutSeed = normalized.filter(point => point.txHash !== seedTxHash);

  if (withoutSeed.length > 0) {
    const earliest = withoutSeed.reduce(
      (min, point) => (point.timestamp < min ? point.timestamp : min),
      withoutSeed[0].timestamp
    );
    const adjustedSeedTimestamp = earliest > 0 ? Math.max(0, earliest - 60) : 0;
    const adjustedSeed = {
      ...seedPoint,
      timestamp: adjustedSeedTimestamp,
      txHash: seedTxHash,
    };
    return [...withoutSeed, adjustedSeed].sort((a, b) => a.timestamp - b.timestamp);
  }

  return [{ ...seedPoint, txHash: seedTxHash }];
};




