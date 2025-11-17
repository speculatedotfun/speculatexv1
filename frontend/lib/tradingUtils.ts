// Trading utility functions
import { formatUnits } from 'viem';

export const MAX_UINT256 = (1n << 256n) - 1n;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function formatBalanceDisplay(value: bigint, decimals: number, places = 3): string {
  const num = Number(formatUnits(value, decimals));
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(places);
}

export function toBigIntSafe(value: any): bigint {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value !== '') return BigInt(value);
    if (value && typeof value === 'object' && typeof value.toString === 'function') {
      const str = value.toString();
      if (str) return BigInt(str);
    }
  } catch (error) {
    console.error('Failed to parse bigint', error);
  }
  return 0n;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function formatPrice(p: number): string {
  return p >= 1 ? `$${p.toFixed(2)}` : `${(p * 100).toFixed(1)}¢`;
}




