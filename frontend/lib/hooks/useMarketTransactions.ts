import { useState, useEffect, useCallback } from 'react';
import type { TransactionRow } from '../marketTransformers';
import { toTransactionRow } from '../marketTransformers';

export function useMarketTransactions(
  marketIdNum: number,
  snapshotData: any
) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);

  const transactionsStorageKey =
    typeof window !== 'undefined' && marketIdNum >= 0
      ? `transactions_v1_${window.location.origin}_${process.env.NEXT_PUBLIC_CHAIN_ID ?? 'unknown'}_${marketIdNum}`
      : null;

  const mergeTransactionRows = useCallback((rows: TransactionRow[]) => {
    if (!rows || rows.length === 0) return;
    setTransactions(prev => {
      const merged = new Map<string, TransactionRow>();
      for (const tx of prev) {
        merged.set(tx.id, tx);
      }
      for (const tx of rows) {
        merged.set(tx.id, tx);
      }
      return Array.from(merged.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200);
    });
  }, []);

  // Load from snapshot data
  useEffect(() => {
    if (!snapshotData) return;
    const tradesDesc = snapshotData.tradesDesc ?? [];
    const txRows: TransactionRow[] = tradesDesc
      .map(toTransactionRow)
      .filter((tx): tx is TransactionRow => tx !== null);

    if (txRows.length > 0) {
      mergeTransactionRows(txRows);
    }
  }, [snapshotData, mergeTransactionRows]);

  // Load from localStorage
  useEffect(() => {
    if (!transactionsStorageKey || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(transactionsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTransactions(parsed);
        }
      }
    } catch (error) {
      console.warn('[useMarketTransactions] Failed to restore cache', error);
    }
  }, [transactionsStorageKey]);

  // Save to localStorage
  useEffect(() => {
    if (!transactionsStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(transactionsStorageKey, JSON.stringify(transactions));
    } catch (error) {
      console.warn('[useMarketTransactions] Failed to persist cache', error);
    }
  }, [transactionsStorageKey, transactions]);

  return {
    transactions,
    mergeTransactionRows,
  };
}




