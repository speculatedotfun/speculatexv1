// Data transformers for market data
import { formatUnits } from 'viem';
import type { SnapshotTrade, SnapshotBalance } from './useMarketSnapshot';
import { absString } from './marketUtils';

export interface Holder {
  address: string;
  balance: string;
  balanceUsd: number;
}

export type TransactionRow = {
  id: string;
  type: 'BuyYes' | 'BuyNo' | 'SellYes' | 'SellNo';
  user: string;
  amount: string;
  output: string;
  price: string;
  timestamp: number;
  txHash: string;
};

export const toTransactionRow = (trade: SnapshotTrade): TransactionRow | null => {
  const txHash = trade.txHash ?? '';
  const user = trade.user?.id?.toLowerCase() ?? '';
  if (!txHash || !user) return null;

  const action = trade.action === 'sell' ? 'sell' : 'buy';
  const side = trade.side === 'no' ? 'no' : 'yes';
  const tokenDelta = trade.tokenDelta ?? '0';
  const usdcDelta = trade.usdcDelta ?? '0';
  const amount =
    action === 'buy' ? absString(usdcDelta) : absString(tokenDelta);
  const output =
    action === 'buy' ? absString(tokenDelta) : absString(usdcDelta);
  const price =
    Number.isFinite(Number(trade.priceE6))
      ? (Number(trade.priceE6) / 1e6).toString()
      : '0';
  const timestamp = Number(trade.timestamp ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  const type =
    action === 'buy'
      ? side === 'yes'
        ? 'BuyYes'
        : 'BuyNo'
      : side === 'yes'
        ? 'SellYes'
        : 'SellNo';

  return {
    id: `${txHash}-${type}`,
    type,
    user,
    amount,
    output,
    price,
    timestamp,
    txHash,
  };
};

export const toHolder = (balance: SnapshotBalance, price: number): Holder | null => {
  const address = balance.user?.id?.toLowerCase() ?? '';
  const rawBalance = balance.tokenBalance;
  if (!address || !rawBalance) return null;
  try {
    const tokenBalance = Number(formatUnits(BigInt(rawBalance), 18));
    if (!Number.isFinite(tokenBalance) || tokenBalance <= 0) return null;
    return {
      address,
      balance: tokenBalance.toString(),
      balanceUsd: tokenBalance * price,
    };
  } catch (error) {
    console.warn('[Transformer] Failed to parse holder balance', error);
    return null;
  }
};




