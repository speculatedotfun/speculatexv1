import { useQuery } from '@tanstack/react-query';
import { fetchSubgraph } from './subgraphClient';

export type SnapshotTimeRange = '1D' | '1W' | '1M' | 'ALL';

export interface SnapshotTrade {
  txHash: string | null;
  timestamp: string | null;
  user: { id: string | null } | null;
  action: string | null;
  side: string | null;
  tokenDelta: string | null;
  usdcDelta: string | null;
  priceE6: string | null;
}

export interface SnapshotBalance {
  user: { id: string | null } | null;
  tokenBalance: string | null;
}

export interface SnapshotMarket {
  id: string;
  createdAt: string | null;
  tradesAsc: SnapshotTrade[];
  tradesDesc: SnapshotTrade[];
  yesBalances: SnapshotBalance[];
  noBalances: SnapshotBalance[];
}

interface SnapshotResponse {
  market: SnapshotMarket | null;
}

const DEFAULT_REFETCH_INTERVAL = 45_000;
const RATE_LIMIT_REFETCH_INTERVAL = 180_000;

const isRateLimitError = (error: unknown): boolean =>
  error instanceof Error && /429/i.test(error.message);

const SNAPSHOT_QUERY = /* GraphQL */ `
  query MarketSnapshot($id: ID!, $since: BigInt!, $txLimit: Int!, $holderLimit: Int!) {
    market(id: $id) {
      id
      createdAt
      tradesAsc: trades(
        where: { timestamp_gte: $since }
        orderBy: timestamp
        orderDirection: asc
        first: 1000
      ) {
        txHash
        timestamp
        user { id }
        action
        side
        tokenDelta
        usdcDelta
        priceE6
      }
      tradesDesc: trades(
        orderBy: timestamp
        orderDirection: desc
        first: $txLimit
      ) {
        txHash
        timestamp
        user { id }
        action
        side
        tokenDelta
        usdcDelta
        priceE6
      }
      yesBalances: balances(
        where: { side: "yes", tokenBalance_gt: "0" }
        orderBy: tokenBalance
        orderDirection: desc
        first: $holderLimit
      ) {
        user { id }
        tokenBalance
      }
      noBalances: balances(
        where: { side: "no", tokenBalance_gt: "0" }
        orderBy: tokenBalance
        orderDirection: desc
        first: $holderLimit
      ) {
        user { id }
        tokenBalance
      }
    }
  }
`;

export function getSecondsForRange(timeRange: SnapshotTimeRange): number | null {
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

export function useMarketSnapshot(
  marketId: number | null,
  timeRange: SnapshotTimeRange,
  txLimit = 200,
  holderLimit = 20,
) {
  return useQuery<SnapshotMarket | null>({
    queryKey: ['marketSnapshot', marketId, timeRange, txLimit, holderLimit],
    enabled: marketId !== null && marketId >= 0,
    staleTime: 5 * 60_000,
    retry: (failureCount: number, error: unknown) => {
      if (isRateLimitError(error)) {
        return failureCount < 1;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex: number) => Math.min(60_000, 1_500 * 2 ** attemptIndex),
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (marketId === null || marketId < 0) return null;

      const secondsRange = getSecondsForRange(timeRange);
      const since =
        secondsRange !== null
          ? Math.max(0, Math.floor(Date.now() / 1000) - secondsRange)
          : 0;

      const data = await fetchSubgraph<SnapshotResponse>(SNAPSHOT_QUERY, {
        id: marketId.toString(),
        since: since.toString(),
        txLimit,
        holderLimit,
      });

      return data.market;
    },
  });
}


