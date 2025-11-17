'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSubgraph } from './subgraphClient';
import type { PricePoint } from './priceHistory/types';

type TimeRange = '1D' | '1W' | '1M' | 'ALL';

function getSecondsForRange(timeRange: TimeRange): number | null {
  switch (timeRange) {
    case '1D':
      return 60 * 60 * 24;
    case '1W':
      return 60 * 60 * 24 * 7;
    case '1M':
      return 60 * 60 * 24 * 30;
    default:
      return null;
  }
}

const ensureSeed = (points: PricePoint[], fallbackTimestamp: number): PricePoint[] => {
  if (points.length === 0) {
    return [
      {
        timestamp: fallbackTimestamp,
        priceYes: 0.5,
        priceNo: 0.5,
        txHash: 'seed',
      },
    ];
  }

  const [first] = points;
  if (
    first &&
    first.txHash === 'seed' &&
    Math.abs(first.priceYes - 0.5) <= 1e-6 &&
    Math.abs(first.priceNo - 0.5) <= 1e-6
  ) {
    return points;
  }

  return [
    {
      timestamp: Math.max(first.timestamp - 1, 0),
      priceYes: 0.5,
      priceNo: 0.5,
      txHash: 'seed',
    },
    ...points,
  ];
};

const normalizePoint = (point: PricePoint): PricePoint => ({
  timestamp: Number(point.timestamp),
  priceYes: Number(point.priceYes),
  priceNo: Number(point.priceNo),
  txHash: point.txHash ?? undefined,
});

export function usePriceHistory(marketId: number | null, timeRange: TimeRange) {
  const queryClient = useQueryClient();

  const queryResult = useQuery<PricePoint[]>({
    queryKey: ['priceHistory', marketId, timeRange],
    enabled: marketId !== null && marketId >= 0,
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (marketId === null || marketId < 0) return [];

      const previous =
        queryClient.getQueryData<PricePoint[]>(['priceHistory', marketId, timeRange]) ?? [];

      const secondsRange = getSecondsForRange(timeRange);
      const since =
        secondsRange !== null
          ? Math.max(0, Math.floor(Date.now() / 1000) - secondsRange)
          : 0;

      try {
        const data = await fetchSubgraph<{
          trades: Array<{
            timestamp: string;
            priceE6: string;
            txHash: string | null;
          }>;
        }>(
          `
            query PriceHistory($marketId: ID!, $since: BigInt!) {
              trades(
                where: { market: $marketId, timestamp_gte: $since }
                orderBy: timestamp
                orderDirection: asc
                first: 1000
              ) {
                timestamp
                priceE6
                txHash
              }
            }
          `,
          {
            marketId: marketId.toString(),
            since: since.toString(),
          },
        );

        if (Array.isArray(data.trades) && data.trades.length > 0) {
          const sorted = data.trades
            .map(trade => ({
              timestamp: Number(trade.timestamp),
              priceYes: Number(trade.priceE6) / 1e6,
              priceNo: 1 - Number(trade.priceE6) / 1e6,
              txHash: trade.txHash ?? undefined,
            }))
            .map(normalizePoint)
            .sort((a, b) => a.timestamp - b.timestamp);

          return ensureSeed(
            sorted,
            sorted[0]?.timestamp ?? Math.floor(Date.now() / 1000),
          );
        }
      } catch (error) {
        console.warn('[usePriceHistory] Failed to load history from subgraph', error);
      }

      if (previous.length > 0) {
        return previous;
      }

      return ensureSeed([], Math.floor(Date.now() / 1000));
    },
  });

  return queryResult;
}

