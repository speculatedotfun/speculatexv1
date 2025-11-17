import { useState, useEffect } from 'react';
import type { Holder } from '../marketTransformers';
import { toHolder } from '../marketTransformers';

export function useMarketHolders(
  snapshotData: any,
  priceYes: number,
  priceNo: number
) {
  const [topHoldersYes, setTopHoldersYes] = useState<Holder[]>([]);
  const [topHoldersNo, setTopHoldersNo] = useState<Holder[]>([]);

  useEffect(() => {
    if (!snapshotData) return;

    const yesBalances = snapshotData.yesBalances ?? [];
    const yesHolders = yesBalances
      .map((balance: any) => toHolder(balance, priceYes))
      .filter((holder): holder is Holder => holder !== null);
    setTopHoldersYes(yesHolders);

    const noBalances = snapshotData.noBalances ?? [];
    const noHolders = noBalances
      .map((balance: any) => toHolder(balance, priceNo))
      .filter((holder): holder is Holder => holder !== null);
    setTopHoldersNo(noHolders);
  }, [snapshotData, priceYes, priceNo]);

  return {
    topHoldersYes,
    topHoldersNo,
  };
}




